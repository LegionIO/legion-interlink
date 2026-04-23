import Foundation

/// Lightweight HTTP client for the LegionIO daemon REST API.
/// All methods are nonisolated and safe to call from any context.
enum DaemonAPI {
    private static var baseURL: String {
        "http://localhost:\(ServiceManager.daemonPort)"
    }

    // MARK: - Public Methods

    static func get(_ path: String, query: [String: String]? = nil) async -> (data: Any?, ok: Bool) {
        var urlString = "\(baseURL)\(path)"
        if let query, !query.isEmpty {
            let qs = query.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
            urlString += "?\(qs)"
        }
        guard let url = URL(string: urlString) else { return (nil, false) }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "GET"
        return await perform(request)
    }

    static func post(_ path: String, body: [String: Any]? = nil) async -> (data: Any?, ok: Bool) {
        guard let url = URL(string: "\(baseURL)\(path)") else { return (nil, false) }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return await perform(request)
    }

    static func put(_ path: String, body: [String: Any]) async -> (data: Any?, ok: Bool) {
        guard let url = URL(string: "\(baseURL)\(path)") else { return (nil, false) }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return await perform(request)
    }

    static func patch(_ path: String, body: [String: Any]) async -> (data: Any?, ok: Bool) {
        guard let url = URL(string: "\(baseURL)\(path)") else { return (nil, false) }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return await perform(request)
    }

    // MARK: - Private

    private static func perform(_ request: URLRequest) async -> (data: Any?, ok: Bool) {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return (nil, false)
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                // Daemon wraps responses in { "data": ... } — unwrap if present
                return (json["data"] ?? json, true)
            }
            if let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                return (jsonArray, true)
            }
            return (nil, true)
        } catch {
            return (nil, false)
        }
    }
}
