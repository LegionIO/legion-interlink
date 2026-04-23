import Foundation

/// Persists chat messages to ~/.legionio/chat_history.json so they survive
/// tab switches and app restarts.
@MainActor
final class ChatStore: ObservableObject {
    static let shared = ChatStore()

    @Published var messages: [ChatMessage] = []

    private let filePath: String

    private init() {
        let home = NSHomeDirectory()
        let dir = "\(home)/.legionio"
        filePath = "\(dir)/chat_history.json"

        // Ensure directory exists
        try? FileManager.default.createDirectory(
            atPath: dir,
            withIntermediateDirectories: true
        )

        // Load existing messages
        messages = Self.load(from: filePath)
    }

    func append(_ message: ChatMessage) {
        messages.append(message)
        save()
    }

    func clearAll() {
        messages.removeAll()
        save()
    }

    private func save() {
        let entries: [[String: String]] = messages.map { msg in
            [
                "id": msg.id.uuidString,
                "role": msg.role,
                "content": msg.content,
                "timestamp": ISO8601DateFormatter().string(from: msg.timestamp)
            ]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: entries, options: .prettyPrinted) else { return }
        let path = filePath
        // Write off main actor to avoid blocking UI
        Task.detached {
            try? data.write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }

    private static func load(from path: String) -> [ChatMessage] {
        guard let data = FileManager.default.contents(atPath: path),
              let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
            return []
        }
        let formatter = ISO8601DateFormatter()
        return entries.compactMap { dict in
            guard let role = dict["role"],
                  let content = dict["content"] else { return nil }
            let timestamp = dict["timestamp"].flatMap { formatter.date(from: $0) } ?? Date()
            return ChatMessage(role: role, content: content, timestamp: timestamp)
        }
    }
}
