import Foundation
import SwiftUI

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
    case starting = "Starting"
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
    case allHealthy
    case setupNeeded
    case degraded
    case allDown
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
    @Published var logContents: String = ""
    @Published var errorLogContents: String = ""
    @Published var setupNeeded: Bool = false

    private let daemonHealthURL = URL(string: "http://localhost:4567/api/ready")!
    private let daemonHealthCheckURL = URL(string: "http://localhost:4567/api/health")!
    private let logPath = "/opt/homebrew/var/log/legion/legion.log"
    private let agenticMarkerPath: String
    private var timer: Timer?

    private var brewPath: String {
        // Prefer Apple Silicon path, fall back to Intel
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/brew") {
            return "/opt/homebrew/bin/brew"
        }
        return "/usr/local/bin/brew"
    }

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.agenticMarkerPath = "\(home)/.legionio/.packs/agentic"
        checkSetupNeeded()
        startPolling()
    }

    // MARK: - Setup Detection

    func checkSetupNeeded() {
        setupNeeded = !FileManager.default.fileExists(atPath: agenticMarkerPath)
    }

    // MARK: - Service Control

    func startAll() {
        for service in ServiceName.allCases {
            startService(service)
        }
        delayedHealthCheck(after: 3)
    }

    func stopAll() {
        // Stop legionio first, then infrastructure
        stopService(.legionio)
        for service in ServiceName.allCases where service != .legionio {
            stopService(service)
        }
        delayedHealthCheck(after: 2)
    }

    func startService(_ service: ServiceName) {
        updateServiceStatus(service, .starting)
        runBrewServices(args: ["services", "start", service.brewName])
        delayedHealthCheck(after: 2)
    }

    func stopService(_ service: ServiceName) {
        runBrewServices(args: ["services", "stop", service.brewName])
        delayedHealthCheck(after: 1)
    }

    func restartDaemon() {
        updateServiceStatus(.legionio, .starting)
        runBrewServices(args: ["services", "restart", ServiceName.legionio.brewName])
        delayedHealthCheck(after: 3)
    }

    // MARK: - Health Checks

    func checkAllServices() async {
        // Check brew services for infrastructure
        for service in ServiceName.allCases where service != .legionio {
            let (running, pid) = await checkBrewService(service.brewName)
            updateServiceStatus(service, running ? .running : .stopped, pid: pid)
        }

        // Check legionio daemon via HTTP
        await checkDaemonHealth()

        lastChecked = Date()
        recalculateOverallStatus()
    }

    func refreshLogs() {
        logContents = tailFile(path: logPath, lines: 200)
    }

    // MARK: - Process Execution (for onboarding)

    func runCommand(_ executable: String, arguments: [String]) async -> (output: String, success: Bool) {
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
    func runCommandStreaming(_ executable: String, arguments: [String], onLine: @escaping @Sendable (String) -> Void) async -> Bool {
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

    // MARK: - Private Helpers

    private func checkBrewService(_ name: String) async -> (running: Bool, pid: Int?) {
        let (output, success) = await runCommand(brewPath, arguments: ["services", "info", name, "--json"])
        guard success else { return (false, nil) }

        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let first = json.first else {
            return (false, nil)
        }

        let running = first["running"] as? Bool ?? false
        let pid = first["pid"] as? Int
        return (running, pid)
    }

    private func checkDaemonHealth() async {
        do {
            let (data, response) = try await URLSession.shared.data(from: daemonHealthURL)
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let ready = json["ready"] as? Bool ?? false
                var components: [String: Bool] = [:]
                if let comps = json["components"] as? [String: Bool] {
                    components = comps
                }
                daemonReadiness = DaemonReadiness(ready: ready, components: components)
                updateServiceStatus(.legionio, ready ? .running : .starting)
            } else {
                daemonReadiness = DaemonReadiness()
                updateServiceStatus(.legionio, .stopped)
            }
        } catch {
            daemonReadiness = DaemonReadiness()
            updateServiceStatus(.legionio, .stopped)
        }
    }

    private func updateServiceStatus(_ service: ServiceName, _ status: ServiceStatus, pid: Int? = nil) {
        if let idx = services.firstIndex(where: { $0.name == service }) {
            services[idx].status = status
            if let pid { services[idx].pid = pid }
        }
    }

    private func recalculateOverallStatus() {
        if setupNeeded {
            overallStatus = .setupNeeded
            return
        }

        let statuses = services.map(\.status)
        if statuses.allSatisfy({ $0 == .running }) {
            overallStatus = .allHealthy
        } else if statuses.allSatisfy({ $0 == .stopped }) {
            overallStatus = .allDown
        } else if statuses.contains(.unknown) {
            overallStatus = .checking
        } else {
            overallStatus = .degraded
        }
    }

    private func runBrewServices(args: [String]) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: brewPath)
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
        process.waitUntilExit()
    }

    private func tailFile(path: String, lines: Int) -> String {
        guard let data = FileManager.default.contents(atPath: path),
              let content = String(data: data, encoding: .utf8) else {
            return "(no log file found at \(path))"
        }
        let allLines = content.components(separatedBy: "\n")
        let tail = allLines.suffix(lines)
        return tail.joined(separator: "\n")
    }

    private func startPolling() {
        Task { await checkAllServices() }
        refreshLogs()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.checkAllServices()
                self.refreshLogs()
            }
        }
    }

    private func delayedHealthCheck(after seconds: Double) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self else { return }
            Task { await self.checkAllServices() }
        }
    }

    deinit {
        timer?.invalidate()
    }
}
