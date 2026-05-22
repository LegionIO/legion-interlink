import Foundation
import SwiftUI
import UserNotifications

struct UpdateItem: Identifiable {
    enum Source: String {
        case brew = "brew"
        case gem = "gem"
    }

    let id: String
    let name: String
    let currentVersion: String
    let availableVersion: String
    let source: Source
    var isUpdating: Bool = false

    var isLex: Bool { name.hasPrefix("lex-") }
    var isCoreLibrary: Bool { name.hasPrefix("legion-") || name == "legionio" }
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

    private init() {
        resolvedBrewPath = Self.findPath("/opt/homebrew/bin/brew", fallback: "/usr/local/bin/brew")
        resolvedLegionGemPath = Self.findPath("/opt/homebrew/bin/legion-gem", fallback: "/usr/local/bin/legion-gem")
        startBackgroundChecks()
    }

    private static func findPath(_ primary: String, fallback: String) -> String {
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

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        DispatchQueue.main.async {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge]) { granted, _ in
                guard granted else { return }
                UNUserNotificationCenter.current().add(request)
            }
        }
    }

    // MARK: - Background Periodic Check

    private func startBackgroundChecks() {
        backgroundTimer = Timer.scheduledTimer(withTimeInterval: 1800, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.checkForUpdates(force: true, background: true)
            }
        }
    }

    // MARK: - Check for Updates

    func checkForUpdates(force: Bool = false, background: Bool = false) async {
        guard !isChecking else { return }
        guard force || !hasChecked else { return }

        isChecking = true
        checkError = nil

        let brew = resolvedBrewPath
        let legionGem = resolvedLegionGemPath

        async let brewResult = Self.checkBrewOutdated(brew: brew)
        async let gemResult = Self.checkGemOutdated(legionGem: legionGem)

        let brewItems = await brewResult
        let gemItems = await gemResult

        let previousCount = items.count
        items = brewItems + gemItems
        hasChecked = true
        lastChecked = Date()
        isChecking = false

        // Notify if new updates were found
        if !items.isEmpty && items.count > previousCount {
            let brewCount = brewItems.count
            let coreCount = gemItems.filter(\.isCoreLibrary).count

            if brewCount > 0 {
                sendNotification(
                    title: "LegionIO Update Available",
                    body: "A new version of legionio is available via Homebrew."
                )
            }
            if coreCount > 0 {
                sendNotification(
                    title: "Legion Core Libraries Outdated",
                    body: "\(coreCount) core librar\(coreCount == 1 ? "y has" : "ies have") updates available."
                )
            }
        }

        // Auto-update lex-* gems (they keep old versions so no runtime breakage)
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
        let source = item.source
        let isLegionioBrew = source == .brew

        Task.detached {
            let success: Bool
            switch source {
            case .brew:
                success = Self.runSync(brew, arguments: ["upgrade", name])
            case .gem:
                success = Self.runSync(legionGem, arguments: ["update", name])
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

            if success && isLegionioBrew {
                await ServiceManager.shared.restartDaemon()
            }
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

    // MARK: - Brew Parsing

    private nonisolated static func checkBrewOutdated(brew: String) async -> [UpdateItem] {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: brew)
        process.arguments = ["outdated", "--json", "legionio/tap/legionio"]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return []
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let formulae = json["formulae"] as? [[String: Any]] else {
            return []
        }

        return formulae.compactMap { formula in
            guard let name = formula["name"] as? String,
                  let installed = (formula["installed_versions"] as? [String])?.first,
                  let available = formula["current_version"] as? String else { return nil }
            return UpdateItem(
                id: "brew:\(name)",
                name: name,
                currentVersion: installed,
                availableVersion: available,
                source: .brew
            )
        }
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
    }
}
