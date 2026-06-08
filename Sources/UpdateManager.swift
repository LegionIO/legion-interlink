import Foundation
import SwiftUI
@preconcurrency import UserNotifications

struct UpdateItem: Identifiable {
    enum Source: String {
        case gem = "gem"
        case cask = "cask"
    }

    let id: String
    let name: String
    let currentVersion: String
    let availableVersion: String
    let source: Source
    var isUpdating: Bool = false

    var isLex: Bool { name.hasPrefix("lex-") }
    var isCoreLibrary: Bool { name.hasPrefix("legion-") || name == "legionio" || name == "legion-interlink" }
    var isLegionio: Bool { name == "legionio" }
    var isInterlink: Bool { name == "legion-interlink" }
}

@MainActor
class UpdateManager: ObservableObject {
    static let shared = UpdateManager()

    @Published var items: [UpdateItem] = []
    @Published var isChecking = false
    @Published var hasChecked = false
    @Published var lastChecked: Date?
    @Published var checkError: String?
    @Published var autoUpdateLex = true

    private let resolvedBrewPath: String
    private let resolvedLegionGemPath: String
    private var backgroundTimer: Timer?
    private var diskVersionTimer: Timer?

    private init() {
        resolvedBrewPath = Self.findPath("/opt/homebrew/bin/brew", fallback: "/usr/local/bin/brew")
        resolvedLegionGemPath = Self.findPath("/opt/homebrew/bin/legion-gem", fallback: "/usr/local/bin/legion-gem")
        startBackgroundChecks()
    }

    static func findPath(_ primary: String, fallback: String) -> String {
        FileManager.default.isExecutableFile(atPath: primary) ? primary : fallback
    }

    var outdatedCount: Int {
        items.count
    }

    var anyUpdating: Bool {
        items.contains { $0.isUpdating }
    }

    // MARK: - Notifications

    private nonisolated func sendNotification(title: String, body: String) {
        // UNUserNotificationCenter requires a proper .app bundle with a bundle ID.
        // Plain binary dev builds have no bundle — skip silently to avoid a hard crash.
        guard Bundle.main.bundleIdentifier != nil else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        // Persistent notification — user must dismiss it explicitly.
        #if compiler(>=6.0)
            if #available(macOS 15.0, *) {
                content.interruptionLevel = .timeSensitive
            }
        #endif

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Background Periodic Check

    private func startBackgroundChecks() {
        backgroundTimer = Timer.scheduledTimer(withTimeInterval: 1800, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.checkForUpdates(force: true, background: true)
            }
        }

        // Every 5 minutes, check if `brew upgrade legion-interlink` replaced the binary on disk
        diskVersionTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.checkDiskVersionAndRelaunch()
        }
    }

    /// Detects when an external `brew upgrade legion-interlink` replaced the binary on disk.
    /// Shows a notification and relaunches the app automatically.
    private nonisolated func checkDiskVersionAndRelaunch() {
        let runningVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let diskVersion = Self.diskVersion()
        guard !runningVersion.isEmpty, !diskVersion.isEmpty,
              diskVersion != runningVersion else { return }

        // Only relaunch once per version bump to avoid loops
        let key = "InterlinkLastRelaunchVersion"
        let lastNotified = UserDefaults.standard.string(forKey: key) ?? ""
        guard lastNotified != diskVersion else { return }
        UserDefaults.standard.set(diskVersion, forKey: key)

        let content = UNMutableNotificationContent()
        content.title = "Legion Interlink"
        content.body = "Updated to \(diskVersion). Restarting..."
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "disk-upgrade-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let bundlePath = Bundle.main.bundlePath
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/sh")
            process.arguments = ["-c", "sleep 1 && open '\(bundlePath)'"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            NSApplication.shared.terminate(nil)
        }
    }

    // MARK: - Check for Updates

    func checkForUpdates(force: Bool = false, background: Bool = false) async {
        guard !isChecking else { return }
        guard force || !hasChecked else { return }

        isChecking = true
        checkError = nil

        let legionGem = resolvedLegionGemPath
        async let gemItems = Self.checkGemOutdated(legionGem: legionGem)
        async let caskItem = Self.checkCaskOutdated()

        let allItems = await Array(gemItems) + (caskItem.map { [$0] } ?? [])

        let previousCount = items.count
        items = allItems
        hasChecked = true
        lastChecked = Date()
        isChecking = false

        if !items.isEmpty && items.count > previousCount {
            let legionioCount = allItems.filter(\.isLegionio).count
            let interlinkCount = allItems.filter(\.isInterlink).count
            let coreCount = allItems.filter { $0.isCoreLibrary && !$0.isLegionio && !$0.isInterlink }.count

            if legionioCount > 0 {
                sendNotification(
                    title: "LegionIO Update Available",
                    body: "A new version of legionio is available."
                )
            }
            if interlinkCount > 0 {
                sendNotification(
                    title: "Legion Interlink Update Available",
                    body: "A new version of Legion Interlink is available. Restart required."
                )
            }
            if coreCount > 0 {
                sendNotification(
                    title: "Legion Core Libraries Outdated",
                    body: "\(coreCount) core librar\(coreCount == 1 ? "y has" : "ies have") updates available."
                )
            }
        }

        if autoUpdateLex {
            let lexItems = items.filter(\.isLex)
            for item in lexItems {
                autoUpdateGem(item)
            }
        }
    }

    // MARK: - Update Actions

    func updateItem(_ item: UpdateItem) {
        guard let idx = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[idx].isUpdating = true

        let brew = resolvedBrewPath
        let legionGem = resolvedLegionGemPath
        let name = item.name
        let isLegionio = item.isLegionio
        let isInterlink = item.isInterlink

        Task.detached {
            var success = false
            if isInterlink {
                success = Self.runSync(brew, arguments: ["upgrade", "legion-interlink"])
            } else {
                success = Self.runSync(legionGem, arguments: ["update", name])
            }

            // For legionio gem, also run brew upgrade to update the CLI binary
            if success && isLegionio {
                _ = Self.runSync(brew, arguments: ["upgrade", "legionio"])
            }

            await MainActor.run {
                if success {
                    self.items.removeAll { $0.id == item.id }
                } else {
                    if let idx = self.items.firstIndex(where: { $0.id == item.id }) {
                        self.items[idx].isUpdating = false
                    }
                }
            }

            if success && isLegionio {
                await ServiceManager.shared.restartService(.legionio)
            }

            // After interlink upgrade, quit — the AppDelegate or cask postflight
            // will detect the new version and relaunch.
            if success && isInterlink {
                await Self.relaunchInterlink()
            }
        }
    }

    private nonisolated static func relaunchInterlink() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let bundlePath = Bundle.main.bundlePath
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/sh")
            process.arguments = ["-c", "sleep 1 && open '\(bundlePath)'"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            NSApplication.shared.terminate(nil)
        }
    }

    func updateAll() {
        for item in items where !item.isUpdating {
            updateItem(item)
        }
    }

    /// Auto-update a lex-* gem silently. legion-gem keeps the old version installed.
    private func autoUpdateGem(_ item: UpdateItem) {
        guard let idx = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[idx].isUpdating = true

        let legionGem = resolvedLegionGemPath
        let name = item.name

        Task.detached {
            let success = Self.runSync(legionGem, arguments: ["update", name])
            await MainActor.run {
                if success {
                    self.items.removeAll { $0.id == item.id }
                } else {
                    if let idx = self.items.firstIndex(where: { $0.id == item.id }) {
                        self.items[idx].isUpdating = false
                    }
                }
            }
        }
    }

    // MARK: - Cask Version Check (GitHub API)

    /// Fetch the latest release tag from the Legion Interlink GitHub releases page.
    /// Returns an UpdateItem if the running version is older than the latest release.
    private nonisolated static func checkCaskOutdated() async -> UpdateItem? {
        let url = URL(string: "https://api.github.com/repos/LegionIO/legion-interlink/releases/latest")!
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return nil
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tagName = json["tag_name"] as? String else {
                return nil
            }
            // tag_name is like "v2.3.2"
            let latestVersion = String(tagName.drop(while: { $0 == "v" }))

            let runningVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
            guard !runningVersion.isEmpty, latestVersion != runningVersion else {
                return nil
            }

            // Only report if newer (numeric comparison handles semver well enough)
            if latestVersion.compare(runningVersion, options: .numeric) == .orderedDescending {
                return UpdateItem(
                    id: "cask:legion-interlink",
                    name: "legion-interlink",
                    currentVersion: runningVersion,
                    availableVersion: latestVersion,
                    source: .cask
                )
            }
        } catch {
            // Network error or GitHub rate-limited — silently skip
        }
        return nil
    }

    // MARK: - Gem Parsing

    private nonisolated static func checkGemOutdated(legionGem: String) async -> [UpdateItem] {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: legionGem)
        process.arguments = ["outdated"]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return []
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else { return [] }

        return output
            .components(separatedBy: "\n")
            .filter { $0.contains("legion") || $0.contains("lex") }
            .compactMap { parseGemLine($0) }
    }

    /// Parses lines like: `legion-apollo (0.5.5 < 0.5.6)`
    private nonisolated static func parseGemLine(_ line: String) -> UpdateItem? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }

        guard let parenStart = trimmed.firstIndex(of: "("),
              let parenEnd = trimmed.firstIndex(of: ")") else { return nil }

        let name = String(trimmed[trimmed.startIndex..<parenStart]).trimmingCharacters(in: .whitespaces)
        let versionPart = String(trimmed[trimmed.index(after: parenStart)..<parenEnd])
        let parts = versionPart.components(separatedBy: " < ")

        guard parts.count == 2 else { return nil }
        let current = parts[0].trimmingCharacters(in: .whitespaces)
        let available = parts[1].trimmingCharacters(in: .whitespaces)

        return UpdateItem(
            id: "gem:\(name)",
            name: name,
            currentVersion: current,
            availableVersion: available,
            source: .gem
        )
    }

    // MARK: - Disk Version Detection

    /// Returns the latest installed version from Homebrew's Cellar, or "" if not found.
    /// Checks both Apple Silicon and Intel Homebrew paths.
    private nonisolated static func diskVersion() -> String {
        for cellarPath in ["/opt/homebrew/Cellar/legion-interlink",
                           "/usr/local/Cellar/legion-interlink"] {
            if let contents = try? FileManager.default.contentsOfDirectory(atPath: cellarPath) {
                let versions = contents.filter { !$0.hasPrefix(".") }.sorted()
                if let latest = versions.last { return latest }
            }
        }
        return ""
    }

    // MARK: - Process Helpers

    private nonisolated static func runSync(_ executable: String, arguments: [String]) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    deinit {
        backgroundTimer?.invalidate()
        diskVersionTimer?.invalidate()
    }
}
