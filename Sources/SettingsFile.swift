import Foundation

enum SettingsFile {
    private static let settingsDir: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.legionio/settings"
    }()

    static func path(for category: String) -> String {
        "\(settingsDir)/\(category).json"
    }

    static func read(_ category: String) -> [String: Any]? {
        let filePath = path(for: category)
        guard let data = FileManager.default.contents(atPath: filePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    static func write(_ category: String, content: [String: Any]) -> Bool {
        let fm = FileManager.default
        if !fm.fileExists(atPath: settingsDir) {
            try? fm.createDirectory(atPath: settingsDir, withIntermediateDirectories: true)
        }

        let filePath = path(for: category)
        guard let data = try? JSONSerialization.data(
            withJSONObject: content,
            options: [.prettyPrinted, .sortedKeys]
        ) else {
            return false
        }

        return fm.createFile(atPath: filePath, contents: data)
    }
}
