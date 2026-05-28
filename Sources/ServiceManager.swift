import Foundation
import SwiftUI
import UserNotifications

// MARK: - Service Definitions

enum ServiceName: String, CaseIterable, Identifiable {
    case legionio
    case redis
    case memcached
    case ollama

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .legionio:  return "LegionIO Daemon"
        case .redis:     return "Redis"
        case .memcached: return "Memcached"
        case .ollama:    return "Ollama"
        }
    }

    var brewName: String { rawValue }
}

enum ServiceStatus: String {
    case running  = "Running"
    case stopped  = "Stopped"
    case starting = "Starting..."
    case stopping = "Stopping..."
    case unknown  = "Checking..."
}

struct ServiceState: Identifiable {
    let name: ServiceName
    var status: ServiceStatus
    var pid: Int?

    var id: String { name.rawValue }
}

// MARK: - Daemon Readiness

struct DaemonReadiness {
    var ready: Bool = false
    var components: [String: Bool] = [:]
}

// MARK: - Overall Status

enum OverallStatus {
    case online
    case offline
    case setupNeeded
    case checking
}

// MARK: - ServiceManager

@MainActor
class ServiceManager: ObservableObject {
    static let shared = ServiceManager()

    @Published var services: [ServiceState] = ServiceName.allCases.map {
        ServiceState(name: $0, status: .unknown)
    }
    @Published var daemonReadiness = DaemonReadiness()
    @Published var overallStatus: OverallStatus = .checking
    @Published var lastChecked: Date?
    @Published var logLines: [LogLine] = []
    @Published var errorLogContents: String = ""

    private static let maxLogLines = 2_000
    private static let trimLogLines = 1_500
    private var nextLogLineID: Int = 0

    struct LogLine: Identifiable {
        let id: Int
        let text: String
    }

    var logContents: String { logLines.map(\.text).joined(separator: "\n") }
    @Published var setupNeeded: Bool = false
    /// True when the LegionIO daemon is online and client configs have been patched.
    @Published var clientConfigsPatched: Bool = false

    /// When true, background polling skips checkAllServices to avoid overwriting transition states.
    private var suppressPolling = false

    /// Tracks the last settled overall status so we can detect online↔offline transitions.
    private var lastOverallStatus: OverallStatus = .checking

    /// Tracks services whose state change was initiated by the user within Interlink.
    /// Cleared after the transition completes. External changes (not in this set) trigger a macOS notification.
    private var userInitiatedTransitions: Set<ServiceName> = []

    /// Whether the dashboard window is currently visible (key or on-screen).
    /// Polling frequency adapts: 10s when visible, 60s when backgrounded.
    var windowVisible: Bool = false {
        didSet {
            guard oldValue != windowVisible else { return }
            restartPollingTimer()
        }
    }

    private static let foregroundPollInterval: TimeInterval = 10
    private static let backgroundPollInterval: TimeInterval = 60

    nonisolated static let daemonPort = 4567
    private let daemonHealthURL = URL(string: "http://localhost:\(daemonPort)/api/ready")!
    private let logPath: String
    private let agenticMarkerPath: String
    private var timer: Timer?
    private var logTimer: Timer?

    /// Resolved once at init — no repeated filesystem checks.
    private let resolvedBrewPath: String
    var resolvedBrewPathPublic: String { resolvedBrewPath }

    private static func findBrewPath() -> String {
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/brew") {
            return "/opt/homebrew/bin/brew"
        }
        return "/usr/local/bin/brew"
    }

    /// Detect the brew log path for legionio from `brew services info --json`.
    /// Falls back to the standard Homebrew log location.
    private static func detectBrewLogPath(brew: String) -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: brew)
        process.arguments = ["services", "info", "legionio", "--json"]
        process.environment = brewEnvironment
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
               let first = json.first,
               let logPath = first["log_path"] as? String,
               !logPath.isEmpty {
                return logPath
            }
        } catch {}

        // Fallback: standard Homebrew log location
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/brew") {
            return "/opt/homebrew/var/log/legion/legion.log"
        }
        return "/usr/local/var/log/legion/legion.log"
    }

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.agenticMarkerPath = "\(home)/.legionio/.packs/agentic"
        self.resolvedBrewPath = Self.findBrewPath()
        self.logPath = Self.detectBrewLogPath(brew: Self.findBrewPath())
        checkSetupNeeded()
        startPolling()
    }

    // MARK: - Setup Detection

    func checkSetupNeeded() {
        setupNeeded = !FileManager.default.fileExists(atPath: agenticMarkerPath)
    }

    // MARK: - Service Control (all async, off main thread)

    func startAll() {
        for service in ServiceName.allCases {
            startService(service)
        }
    }

    func stopAll() {
        // Stop legionio first, then infrastructure
        stopService(.legionio)
        for service in ServiceName.allCases where service != .legionio {
            stopService(service)
        }
    }

    func startService(_ service: ServiceName) {
        updateServiceStatus(service, .starting)
        userInitiatedTransitions.insert(service)
        suppressPolling = true
        let brew = resolvedBrewPath
        let name = service.brewName
        let healthURL = daemonHealthURL
        Task.detached {
            Self.runProcess(brew, arguments: ["services", "start", name])
            await Self.waitForServiceReady(service: service, brew: brew, target: true, timeout: 60)
            // For legionio, also wait for the HTTP health endpoint to confirm ready
            if service == .legionio {
                await Self.waitForDaemonReady(url: healthURL, timeout: 120)
            }
            await MainActor.run {
                self.userInitiatedTransitions.remove(service)
                self.updateServiceStatus(service, .running)
                self.suppressPolling = false
                self.recalculateOverallStatus()
            }
        }
    }

    func stopService(_ service: ServiceName) {
        updateServiceStatus(service, .stopping)
        userInitiatedTransitions.insert(service)
        if service == .legionio {
            daemonReadiness = DaemonReadiness()
        }
        suppressPolling = true
        let brew = resolvedBrewPath
        let name = service.brewName
        Task.detached {
            Self.runProcess(brew, arguments: ["services", "stop", name])
            if service == .legionio {
                // Fallback: kill any lingering process on the daemon port
                Self.killProcessOnPort(Self.daemonPort)
            }
            // Wait until health check confirms the service is actually down
            await Self.waitForServiceReady(service: service, brew: brew, target: false, timeout: 60)
            await MainActor.run {
                self.userInitiatedTransitions.remove(service)
                self.updateServiceStatus(service, .stopped)
                self.suppressPolling = false
                self.recalculateOverallStatus()
            }
        }
    }

    func restartService(_ service: ServiceName) {
        updateServiceStatus(service, .stopping)
        userInitiatedTransitions.insert(service)
        suppressPolling = true
        let brew = resolvedBrewPath
        let name = service.brewName
        let healthURL = daemonHealthURL
        Task.detached {
            Self.runProcess(brew, arguments: ["services", "restart", name])
            await Self.waitForServiceReady(service: service, brew: brew, target: true, timeout: 60)
            // For legionio, also wait for the HTTP health endpoint to confirm ready
            if service == .legionio {
                await Self.waitForDaemonReady(url: healthURL, timeout: 120)
            }
            await MainActor.run {
                self.userInitiatedTransitions.remove(service)
                self.updateServiceStatus(service, .running)
                self.suppressPolling = false
                self.recalculateOverallStatus()
            }
        }
    }

    // MARK: - Health Checks

    func checkAllServices() async {
        let brew = resolvedBrewPath

        // Single brew invocation for all services instead of 4 separate process spawns
        async let allServicesResult = Self.checkAllBrewServices(brew: brew)
        async let daemonHealthResult = Self.checkDaemonHealth(url: daemonHealthURL)

        let serviceMap = await allServicesResult
        let daemonHealth = await daemonHealthResult

        // Update UI on main actor — skip services in transition states
        for service in ServiceName.allCases {
            let result = serviceMap[service.brewName] ?? (running: false, pid: nil)
            if service == .legionio {
                daemonReadiness = daemonHealth.readiness
                let daemonOnline = result.running && daemonHealth.responding
                updateServiceIfStable(.legionio, daemonOnline ? .running : .stopped, pid: result.pid)
            } else {
                updateServiceIfStable(service, result.running ? .running : .stopped, pid: result.pid)
            }
        }

        lastChecked = Date()
        recalculateOverallStatus()
    }

    /// Strong reference to the live `tail -f` process (used when tailing log file on reopen).
    private var tailProcess: Process?

    func clearLogs() {
        logLines = []
        nextLogLineID = 0
        let path = logPath
        Task.detached {
            if let fh = FileHandle(forWritingAtPath: path) {
                fh.truncateFile(atOffset: 0)
                fh.closeFile()
            }
        }
    }

    func refreshLogs() {
        let path = logPath
        Task.detached {
            let content = Self.tailFile(path: path, lines: 200)
            let lines = content.components(separatedBy: "\n")
            await MainActor.run {
                self.logLines = lines.map { text in
                    let line = LogLine(id: self.nextLogLineID, text: text)
                    self.nextLogLineID += 1
                    return line
                }
            }
        }
    }

    /// Start fast log streaming (call when Logs tab is visible).
    /// Starts a `tail -f` process on the brew log file for live output.
    func startFastLogPolling() {
        guard tailProcess == nil else { return }
        // First show a snapshot of recent lines
        refreshLogs()
        // Then start a live tail for new lines
        let path = logPath
        guard FileManager.default.fileExists(atPath: path) else {
            // No log file yet — fall back to polling until one exists
            logTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
                guard let self else { return }
                Task { @MainActor in
                    if FileManager.default.fileExists(atPath: path) {
                        self.stopFastLogPolling()
                        self.startFastLogPolling()
                    }
                }
            }
            return
        }
        startTailProcess(path: path)
    }

    /// Start a `tail -f` process on the given file, streaming new lines into logLines.
    private func startTailProcess(path: String) {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tail")
        process.arguments = ["-f", "-n", "200", path]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        final class LineBuffer: @unchecked Sendable { var value = "" }
        let lineBuffer = LineBuffer()

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let self else { return }
            guard let chunk = String(data: data, encoding: .utf8) else { return }
            var lines = (lineBuffer.value + chunk).components(separatedBy: "\n")
            lineBuffer.value = lines.removeLast()
            guard !lines.isEmpty else { return }
            let newLines = lines
            Task { @MainActor [weak self] in
                guard let self else { return }
                let logEntries = newLines.map { text in
                    let entry = LogLine(id: self.nextLogLineID, text: text)
                    self.nextLogLineID += 1
                    return entry
                }
                self.logLines.append(contentsOf: logEntries)
                if self.logLines.count > Self.maxLogLines {
                    self.logLines.removeFirst(self.logLines.count - Self.trimLogLines)
                }
            }
        }

        process.terminationHandler = { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.tailProcess?.standardOutput.map { ($0 as? Pipe)?.fileHandleForReading.readabilityHandler = nil }
                self.tailProcess = nil
            }
        }

        do {
            try process.run()
            tailProcess = process
        } catch {
            logLines.append(LogLine(id: nextLogLineID, text: "[interlink] failed to tail log file: \(error.localizedDescription)"))
            nextLogLineID += 1
        }
    }

    /// Stop fast log tailing (call when Logs tab is hidden).
    func stopFastLogPolling() {
        logTimer?.invalidate()
        logTimer = nil
        tailProcess?.terminate()
        tailProcess?.standardOutput.map { ($0 as? Pipe)?.fileHandleForReading.readabilityHandler = nil }
        tailProcess = nil
    }
    // MARK: - Process Execution (for onboarding)

    nonisolated func runCommand(_ executable: String, arguments: [String]) async -> (output: String, success: Bool) {
        await withCheckedContinuation { continuation in
            let process = Process()
            let pipe = Pipe()

            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.standardOutput = pipe
            process.standardError = pipe

            do {
                try process.run()
                process.waitUntilExit()

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                continuation.resume(returning: (output, process.terminationStatus == 0))
            } catch {
                continuation.resume(returning: (error.localizedDescription, false))
            }
        }
    }

    /// Run a command and stream output line-by-line to a callback.
    nonisolated func runCommandStreaming(_ executable: String, arguments: [String], onLine: @escaping @Sendable (String) -> Void) async -> Bool {
        await withCheckedContinuation { continuation in
            let process = Process()
            let pipe = Pipe()

            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.standardOutput = pipe
            process.standardError = pipe

            pipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                if let line = String(data: data, encoding: .utf8) {
                    onLine(line)
                }
            }

            do {
                try process.run()
                process.waitUntilExit()
                pipe.fileHandleForReading.readabilityHandler = nil
                continuation.resume(returning: process.terminationStatus == 0)
            } catch {
                pipe.fileHandleForReading.readabilityHandler = nil
                continuation.resume(returning: false)
            }
        }
    }

    // MARK: - Static helpers (run off main thread)

    /// Run a command synchronously. Call from Task.detached only.
    private nonisolated static func runProcess(_ executable: String, arguments: [String], workingDirectory: String? = nil) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.environment = brewEnvironment
        if let workingDirectory {
            process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)
        }
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
        process.waitUntilExit()
    }

    /// Poll a service until it reaches the target state (running or stopped), up to `timeout` seconds.
    /// Checks every second using `brew services info`.
    private nonisolated static func waitForServiceReady(
        service: ServiceName, brew: String, target: Bool, timeout: Int
    ) async {
        let interval: UInt64 = 1_000_000_000  // 1 second
        let maxAttempts = timeout

        for _ in 0..<maxAttempts {
            try? await Task.sleep(nanoseconds: interval)

            let result = await checkBrewService(brew: brew, name: service.brewName)
            if result.running == target {
                return
            }
        }
    }

    /// Poll the daemon HTTP health endpoint until it reports `ready: true`, up to `timeout` seconds.
    private nonisolated static func waitForDaemonReady(url: URL, timeout: Int) async {
        let interval: UInt64 = 1_000_000_000  // 1 second
        for _ in 0..<timeout {
            try? await Task.sleep(nanoseconds: interval)
            let result = await checkDaemonHealth(url: url)
            if result.responding {
                return
            }
        }
    }

    /// Kill processes listening on a given port. Fallback for when brew services stop leaves a lingering process.
    /// Uses -sTCP:LISTEN to only target servers, not clients (avoids killing ourselves).
    private nonisolated static func killProcessOnPort(_ port: Int) {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-ti:\(port)", "-sTCP:LISTEN"]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !output.isEmpty else { return }

            let myPid = ProcessInfo.processInfo.processIdentifier

            for pidStr in output.components(separatedBy: "\n") {
                if let pid = Int32(pidStr.trimmingCharacters(in: .whitespaces)),
                   pid != myPid {
                    kill(pid, SIGTERM)
                }
            }
        } catch {
            // lsof not available or failed — nothing to do
        }
    }

    /// A minimal environment suitable for running brew and legionio from within
    /// a .app bundle, which launches with a bare PATH that omits /opt/homebrew/bin.
    private nonisolated static var brewEnvironment: [String: String] {
        var env = ProcessInfo.processInfo.environment
        // Ensure both Apple Silicon and Intel Homebrew prefixes are in PATH.
        let extras = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin"
        let current = env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = "\(extras):\(current)"
        env["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
        // Prevent brew from fetching the formula API over the network — the .app
        // sandbox has no DNS, so brew services info would fail with a curl error
        // before returning any JSON.
        env["HOMEBREW_NO_AUTO_UPDATE"] = "1"
        env["HOMEBREW_NO_ANALYTICS"] = "1"
        env["HOMEBREW_NO_INSTALL_FROM_API"] = "1"
        return env
    }

    /// Check all brew services in a single process invocation. Returns a map of service name -> status.
    private nonisolated static func checkAllBrewServices(brew: String) async -> [String: (running: Bool, pid: Int?)] {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: brew)
        process.arguments = ["services", "list", "--json"]
        process.environment = brewEnvironment
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return [:]
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return [:]
        }

        var result: [String: (running: Bool, pid: Int?)] = [:]
        for entry in json {
            guard let name = entry["name"] as? String else { continue }
            let running = entry["running"] as? Bool ?? (entry["status"] as? String == "started")
            let pid = entry["pid"] as? Int
            result[name] = (running: running, pid: pid)
        }
        return result
    }

    /// Check a single brew service status (used during start/stop transitions).
    private nonisolated static func checkBrewService(brew: String, name: String) async -> (running: Bool, pid: Int?) {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: brew)
        process.arguments = ["services", "info", name, "--json"]
        process.environment = brewEnvironment
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return (false, nil)
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let first = json.first else {
            return (false, nil)
        }

        let running = first["running"] as? Bool ?? false
        let pid = first["pid"] as? Int
        return (running, pid)
    }

    /// Check daemon health via HTTP. Runs entirely off main thread.
    private nonisolated static func checkDaemonHealth(url: URL) async -> (readiness: DaemonReadiness, responding: Bool) {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let payload = json["data"] as? [String: Any] ?? json
                let ready = payload["ready"] as? Bool ?? false
                var components: [String: Bool] = [:]
                if let comps = payload["components"] as? [String: Bool] {
                    components = comps
                }
                return (DaemonReadiness(ready: ready, components: components), ready)
            }
        } catch {
            // Connection refused / timeout — daemon is down
        }
        return (DaemonReadiness(), false)
    }

    /// Read the tail of a log file. Runs off main thread.
    private nonisolated static func tailFile(path: String, lines: Int) -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tail")
        process.arguments = ["-n", "\(lines)", path]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? "(unable to read log)"
        } catch {
            return "(no log file found at \(path))"
        }
    }

    // MARK: - Private Helpers

    private func updateServiceStatus(_ service: ServiceName, _ status: ServiceStatus, pid: Int? = nil) {
        if let idx = services.firstIndex(where: { $0.name == service }) {
            services[idx].status = status
            if let pid {
                services[idx].pid = pid
            } else if status == .stopped {
                services[idx].pid = nil
            }
        }
    }

    /// Like updateServiceStatus, but skips if the service is in a transition state (.stopping/.starting).
    /// This prevents health-check results from flickering the UI during start/stop operations.
    /// Sends a macOS notification if the state changed externally (not initiated by Interlink).
    private func updateServiceIfStable(_ service: ServiceName, _ status: ServiceStatus, pid: Int? = nil) {
        if let idx = services.firstIndex(where: { $0.name == service }) {
            let current = services[idx].status
            if current == .stopping || current == .starting {
                return  // Don't overwrite transition states
            }

            let stateChanged = current != status && current != .unknown
            if stateChanged && !userInitiatedTransitions.contains(service) {
                sendExternalStateNotification(service: service, newStatus: status)
            }

            services[idx].status = status
            if let pid {
                services[idx].pid = pid
            } else if status == .stopped {
                services[idx].pid = nil
            }
        }
    }

    // MARK: - External State Notifications

    private func sendExternalStateNotification(service: ServiceName, newStatus: ServiceStatus) {
        guard Bundle.main.bundleIdentifier != nil else { return }

        let content = UNMutableNotificationContent()
        content.title = "Legion Interlink"
        switch newStatus {
        case .running:
            content.body = "\(service.displayName) was started externally."
        case .stopped:
            content.body = "\(service.displayName) has stopped."
        default:
            return
        }

        let request = UNNotificationRequest(
            identifier: "external-\(service.rawValue)-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func recalculateOverallStatus() {
        if setupNeeded {
            overallStatus = .setupNeeded
        } else {
            let legionService = services.first(where: { $0.name == .legionio })
            if legionService?.status == .running {
                overallStatus = .online
            } else if services.map(\.status).contains(.unknown) {
                overallStatus = .checking
            } else {
                overallStatus = .offline
            }
        }

        lastOverallStatus = overallStatus

        // Config patching is manual (via Clients tab toggles) — no auto-routing here.
    }

    private func startPolling() {
        Task { await checkAllServices() }
        restartPollingTimer()
    }

    private func restartPollingTimer() {
        timer?.invalidate()
        let interval = windowVisible ? Self.foregroundPollInterval : Self.backgroundPollInterval
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                if !self.suppressPolling {
                    await self.checkAllServices()
                }
            }
        }
    }

    deinit {
        timer?.invalidate()
        logTimer?.invalidate()
        tailProcess?.terminate()
        tailProcess?.standardOutput.map { ($0 as? Pipe)?.fileHandleForReading.readabilityHandler = nil }
    }
}

// MARK: - Client Config Manager

/// Manages patching and restoring AI client config files when the LegionIO
/// daemon comes online or goes offline.  All methods are nonisolated and must
/// be called from Task.detached — they never touch the main actor.
enum ClientConfigManager {
    private static let daemonInferenceURL = "http://localhost:4567/api/llm/inference"
    private static let home = FileManager.default.homeDirectoryForCurrentUser.path

    // MARK: - Public Entry Points

    /// Patch all client configs to route inference through LegionIO.
    static func applyLegionIOConfigs() {
        patchClaudeSettingsImpl()
        patchCodexConfigImpl()
    }

    /// Restore all original client configs from backups.
    static func restoreOriginalConfigs() {
        restoreClaudeSettingsImpl()
        restoreCodexConfigImpl()
    }

    /// Patch only Claude Code's settings.json.
    static func applyClaudeConfig() { patchClaudeSettingsImpl() }

    /// Restore only Claude Code's settings.json.
    static func restoreClaudeConfig() { restoreClaudeSettingsImpl() }

    /// Patch only Codex's config.toml.
    static func applyCodexConfig() { patchCodexConfigImpl() }

    /// Restore only Codex's config.toml.
    static func restoreCodexConfig() { restoreCodexConfigImpl() }

    // MARK: - Claude Code (~/.claude/settings.json)

    private static var claudeSettingsPath: String { "\(home)/.claude/settings.json" }
    private static var claudeSettingsBackupPath: String { "\(home)/.claude/settings.json.legionio-backup" }

    private static func patchClaudeSettingsImpl() {
        let fm = FileManager.default
        let path = claudeSettingsPath
        let backupPath = claudeSettingsBackupPath

        // Only back up once per session (don't overwrite an existing backup)
        if !fm.fileExists(atPath: backupPath) {
            if fm.fileExists(atPath: path) {
                try? fm.copyItem(atPath: path, toPath: backupPath)
            }
        }

        // Read existing JSON (start from empty dict if the file doesn't exist)
        var json: [String: Any] = [:]
        if let data = fm.contents(atPath: path),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            json = parsed
        }

        // Patch env.ANTHROPIC_BASE_URL
        var env = json["env"] as? [String: Any] ?? [:]
        env["ANTHROPIC_BASE_URL"] = daemonInferenceURL
        json["env"] = env

        guard let data = try? JSONSerialization.data(
            withJSONObject: json,
            options: [.prettyPrinted, .sortedKeys]
        ) else { return }

        // Create parent directory if needed
        let dir = (path as NSString).deletingLastPathComponent
        try? fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
        fm.createFile(atPath: path, contents: data)
    }

    private static func restoreClaudeSettingsImpl() {
        let fm = FileManager.default
        let path = claudeSettingsPath
        let backupPath = claudeSettingsBackupPath

        guard fm.fileExists(atPath: backupPath) else { return }  // no-op if no backup
        try? fm.removeItem(atPath: path)
        try? fm.moveItem(atPath: backupPath, toPath: path)
    }

    // MARK: - Codex (~/.codex/config.toml)

    private static var codexConfigPath: String { "\(home)/.codex/config.toml" }
    private static var codexConfigBackupPath: String { "\(home)/.codex/config.toml.legionio-backup" }

    private static let legionProviderBlock = """

[model_providers.legionio]
name = "LegionIO"
base_url = "\(daemonInferenceURL)"
wire_api = "responses"
"""

    private static func patchCodexConfigImpl() {
        let fm = FileManager.default
        let path = codexConfigPath
        let backupPath = codexConfigBackupPath

        // Only back up once per session
        if !fm.fileExists(atPath: backupPath) {
            if fm.fileExists(atPath: path) {
                try? fm.copyItem(atPath: path, toPath: backupPath)
            }
        }

        // Read existing TOML (or start fresh)
        var toml = ""
        if let data = fm.contents(atPath: path),
           let str = String(data: data, encoding: .utf8) {
            toml = str
        }

        // 1. Replace or append the top-level model_provider assignment
        let providerLine = "model_provider = \"legionio\""
        if let range = toml.range(of: #"(?m)^model_provider\s*=\s*"[^"]*""#, options: .regularExpression) {
            toml.replaceSubrange(range, with: providerLine)
        } else {
            // Prepend at the top (before any section headers)
            toml = providerLine + "\n" + toml
        }

        // 2. Append the [model_providers.legionio] block if not already present
        if !toml.contains("[model_providers.legionio]") {
            toml += legionProviderBlock
        } else {
            // Update the base_url line inside the existing block
            let updatedURL = "base_url = \"\(daemonInferenceURL)\""
            if let range = toml.range(
                of: #"(?m)(^\[model_providers\.legionio\][\s\S]*?^base_url\s*=\s*)"[^"]*""#,
                options: .regularExpression
            ) {
                // Replace just the base_url value inside the block
                let block = String(toml[range])
                if let urlRange = block.range(of: #"base_url\s*=\s*"[^"]*""#, options: .regularExpression) {
                    var mutableBlock = block
                    mutableBlock.replaceSubrange(urlRange, with: updatedURL)
                    toml.replaceSubrange(range, with: mutableBlock)
                }
            }
        }

        guard let data = toml.data(using: .utf8) else { return }

        let dir = (path as NSString).deletingLastPathComponent
        try? fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
        fm.createFile(atPath: path, contents: data)
    }

    private static func restoreCodexConfigImpl() {
        let fm = FileManager.default
        let path = codexConfigPath
        let backupPath = codexConfigBackupPath

        guard fm.fileExists(atPath: backupPath) else { return }  // no-op if no backup
        try? fm.removeItem(atPath: path)
        try? fm.moveItem(atPath: backupPath, toPath: path)
    }
}
