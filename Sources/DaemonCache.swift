import SwiftUI

// MARK: - Cached Models (shared across tabs)

struct CachedExtension: Identifiable {
    let id: String
    let name: String
    let namespace: String
    let state: String          // raw API state: "running", "registered", etc.
    let version: String
    let runners: [(name: String, methodCount: Int)]

    /// Display-friendly state: "running" → "ready"
    var displayState: String {
        state == "running" ? "ready" : state
    }

    var isReady: Bool {
        state == "running" || state == "active"
    }
}

struct CachedWorker: Identifiable {
    let id: String
    let state: String        // "active", "paused", "stopped"
    let className: String
    let taskCount: Int
}

// MARK: - Identity / LLM Models

struct CachedIdentity {
    let id: String
    let canonicalName: String
    let kind: String
    let trust: String
    let mode: String
    let registeredProviders: [CachedIdentityProvider]
}

struct CachedIdentityProvider: Identifiable {
    let id: String          // provider name
    let type: String        // "auth", "fallback"
    let trustLevel: String
    let capabilities: [String]
    let status: String?     // from providers dict
}

struct CachedLLMProvider: Identifiable {
    let id: String          // "provider:instance"
    let provider: String
    let instance: String
    let tier: String
    let capabilities: [String]
    let circuitState: String
    let credentialFingerprint: String?
}

struct CachedLLMModel: Identifiable {
    let id: String
    let types: [String]     // "inference", "embed"
    let providers: [String]
    let modelFamilies: [String]
    let capabilities: [String]
    let maxContext: Int?
    let enabled: Bool
}

/// A single key/value setting from the daemon API.
struct CachedSettingField: Identifiable {
    let id: String   // dotted key path, e.g. "cache.driver"
    let label: String
    let value: String
}

/// One settings section (matching a file in ~/.legionio/settings/).
struct CachedSettingsSection: Identifiable {
    let id: String        // top-level key, e.g. "cache"
    let filename: String  // e.g. "cache.json"
    let fields: [CachedSettingField]
}

// MARK: - Daemon Cache

/// Shared in-memory cache for daemon data (extensions, workers).
/// Data is loaded once on first access and only refreshed when the user clicks "refresh".
@MainActor
final class DaemonCache: ObservableObject {
    static let shared = DaemonCache()

    // Extensions
    @Published var extensions: [CachedExtension] = []
    @Published var extensionsLoaded = false
    @Published var extensionsLoading = false
    @Published var extensionsError: String?

    // Workers
    @Published var workers: [CachedWorker] = []
    @Published var workersLoaded = false
    @Published var workersLoading = false
    @Published var workersError: String?

    // Settings
    @Published var settings: [CachedSettingsSection] = []
    @Published var settingsLoaded = false
    @Published var settingsLoading = false
    @Published var settingsError: String?

    // Identity
    @Published var identity: CachedIdentity?
    @Published var identityLoaded = false
    @Published var identityLoading = false
    @Published var identityError: String?

    // LLM Providers
    @Published var llmProviders: [CachedLLMProvider] = []
    @Published var llmProvidersLoaded = false
    @Published var llmProvidersLoading = false
    @Published var llmProvidersError: String?

    // LLM Models
    @Published var llmModels: [CachedLLMModel] = []
    @Published var llmModelsLoaded = false
    @Published var llmModelsLoading = false
    @Published var llmModelsError: String?

    private static let settingsDir: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.legionio/settings"
    }()

    private init() {}

    // MARK: - Extensions

    /// Load extensions if not already cached. Pass force: true to refresh.
    func loadExtensions(force: Bool = false) async {
        guard !extensionsLoading else { return }
        guard force || !extensionsLoaded else { return }

        extensionsLoading = true
        extensionsError = nil

        let result = await DaemonAPI.get("/api/extension_catalog")

        if result.ok, let items = result.data as? [[String: Any]] {
            extensions = items.compactMap { Self.parseExtension($0) }
        } else if !result.ok {
            extensionsError = "Failed to load extensions — is the daemon running?"
        } else {
            extensions = []
        }
        extensionsLoaded = true
        extensionsLoading = false
    }

    private static func parseExtension(_ dict: [String: Any]) -> CachedExtension? {
        guard let name = dict["name"] as? String else { return nil }
        let id = dict["id"] as? String ?? name
        let namespace = dict["namespace"] as? String ?? ""
        let state = dict["state"] as? String ?? dict["status"] as? String ?? "unknown"
        let version = dict["version"] as? String ?? "—"
        var runners: [(name: String, methodCount: Int)] = []
        if let runnerList = dict["runners"] as? [[String: Any]] {
            for r in runnerList {
                let rName = r["name"] as? String ?? r["class"] as? String ?? "unknown"
                let methods = r["methodCount"] as? Int ?? r["methods"] as? Int ?? 0
                runners.append((name: rName, methodCount: methods))
            }
        }
        return CachedExtension(id: id, name: name, namespace: namespace, state: state, version: version, runners: runners)
    }

    // MARK: - Workers

    /// Load workers if not already cached. Pass force: true to refresh.
    func loadWorkers(force: Bool = false) async {
        guard !workersLoading else { return }
        guard force || !workersLoaded else { return }

        workersLoading = true
        workersError = nil

        let result = await DaemonAPI.get("/api/workers")

        if result.ok, let items = result.data as? [[String: Any]] {
            workers = items.compactMap { Self.parseWorker($0) }
        } else if !result.ok {
            workersError = "Failed to load workers — is the daemon running?"
        } else {
            workers = []
        }
        workersLoaded = true
        workersLoading = false
    }

    private static func parseWorker(_ dict: [String: Any]) -> CachedWorker? {
        let id: String
        if let sid = dict["worker_id"] as? String { id = sid }
        else if let nid = dict["id"] as? Int { id = String(nid) }
        else { id = UUID().uuidString }
        let state = dict["lifecycle_state"] as? String ?? dict["state"] as? String ?? "unknown"
        let className = dict["name"] as? String ?? dict["extension_name"] as? String ?? "Unknown"
        let taskCount = dict["taskCount"] as? Int ?? dict["tasks"] as? Int ?? 0
        return CachedWorker(id: id, state: state, className: className, taskCount: taskCount)
    }

    // MARK: - Settings

    /// Load settings if not already cached. Pass force: true to refresh.
    func loadSettings(force: Bool = false) async {
        guard !settingsLoading else { return }
        guard force || !settingsLoaded else { return }

        settingsLoading = true
        settingsError = nil

        // 1. Read which setting files exist on disk (off main thread)
        let dir = Self.settingsDir
        let allowedKeys = await Task.detached { () -> Set<String> in
            let fm = FileManager.default
            guard let contents = try? fm.contentsOfDirectory(atPath: dir) else {
                return []
            }
            return Set(contents.compactMap { filename -> String? in
                guard filename.hasSuffix(".json") else { return nil }
                return String(filename.dropLast(5))
            })
        }.value

        if allowedKeys.isEmpty {
            settingsError = "No settings files found at\n~/.legionio/settings/"
            settingsLoaded = true
            settingsLoading = false
            return
        }

        // 2. Fetch full settings from the daemon API
        let result = await DaemonAPI.get("/api/settings")

        if result.ok, let dict = result.data as? [String: Any] {
            settings = dict
                .filter { allowedKeys.contains($0.key) }
                .sorted(by: { $0.key < $1.key })
                .map { key, value in
                    let fields: [CachedSettingField]
                    if let nested = value as? [String: Any] {
                        fields = Self.flattenJSON(nested, prefix: key)
                    } else {
                        fields = [CachedSettingField(
                            id: key,
                            label: key,
                            value: Self.stringifyValue(value)
                        )]
                    }
                    return CachedSettingsSection(
                        id: key,
                        filename: "\(key).json",
                        fields: fields
                    )
                }
        } else if !result.ok {
            settingsError = "Failed to load settings — is the daemon running?"
        } else {
            settings = []
        }
        settingsLoaded = true
        settingsLoading = false
    }

    // MARK: - Identity

    func loadIdentity(force: Bool = false) async {
        guard !identityLoading else { return }
        guard force || !identityLoaded else { return }

        identityLoading = true
        identityError = nil

        let result = await DaemonAPI.get("/api/identity")

        if result.ok, let dict = result.data as? [String: Any] {
            identity = Self.parseIdentity(dict)
        } else if !result.ok {
            identityError = "Failed to load identity — is the daemon running?"
        }
        identityLoaded = true
        identityLoading = false
    }

    private static func parseIdentity(_ dict: [String: Any]) -> CachedIdentity {
        let id = dict["id"] as? String ?? "—"
        let canonicalName = dict["canonical_name"] as? String ?? "—"
        let kind = dict["kind"] as? String ?? "—"
        let trust = dict["trust"] as? String ?? "—"
        let mode = dict["mode"] as? String ?? "—"

        // providers dict: { "kerberos": { status, trust, resolved_at }, ... }
        let providerStatus: [String: String]
        if let ps = dict["providers"] as? [String: Any] {
            providerStatus = ps.compactMapValues { ($0 as? [String: Any])?["status"] as? String }
        } else {
            providerStatus = [:]
        }

        // registered_providers array
        var regProviders: [CachedIdentityProvider] = []
        if let rp = dict["registered_providers"] as? [[String: Any]] {
            regProviders = rp.compactMap { p in
                guard let name = p["name"] as? String else { return nil }
                return CachedIdentityProvider(
                    id: name,
                    type: p["type"] as? String ?? "—",
                    trustLevel: p["trust_level"] as? String ?? "—",
                    capabilities: p["capabilities"] as? [String] ?? [],
                    status: providerStatus[name]
                )
            }
        }

        return CachedIdentity(
            id: id,
            canonicalName: canonicalName,
            kind: kind,
            trust: trust,
            mode: mode,
            registeredProviders: regProviders
        )
    }

    // MARK: - LLM Providers

    func loadLLMProviders(force: Bool = false) async {
        guard !llmProvidersLoading else { return }
        guard force || !llmProvidersLoaded else { return }

        llmProvidersLoading = true
        llmProvidersError = nil

        let result = await DaemonAPI.get("/api/llm/providers")

        if result.ok, let dict = result.data as? [String: Any],
           let items = dict["providers"] as? [[String: Any]] {
            llmProviders = items.compactMap { Self.parseLLMProvider($0) }
        } else if !result.ok {
            llmProvidersError = "Failed to load LLM providers — is the daemon running?"
        } else {
            llmProviders = []
        }
        llmProvidersLoaded = true
        llmProvidersLoading = false
    }

    private static func parseLLMProvider(_ dict: [String: Any]) -> CachedLLMProvider? {
        guard let provider = dict["provider"] as? String,
              let instance = dict["instance"] as? String else { return nil }
        let tier = dict["tier"] as? String ?? "—"
        let capabilities = dict["capabilities"] as? [String] ?? []
        let circuitState = (dict["health"] as? [String: Any])?["circuit_state"] as? String ?? "—"
        let fingerprint = dict["credential_fingerprint"] as? String
        return CachedLLMProvider(
            id: "\(provider):\(instance)",
            provider: provider,
            instance: instance,
            tier: tier,
            capabilities: capabilities,
            circuitState: circuitState,
            credentialFingerprint: fingerprint
        )
    }

    // MARK: - LLM Models

    func loadLLMModels(force: Bool = false) async {
        guard !llmModelsLoading else { return }
        guard force || !llmModelsLoaded else { return }

        llmModelsLoading = true
        llmModelsError = nil

        let result = await DaemonAPI.get("/api/llm/models")

        if result.ok, let dict = result.data as? [String: Any],
           let items = dict["models"] as? [[String: Any]] {
            llmModels = items.compactMap { Self.parseLLMModel($0) }
        } else if !result.ok {
            llmModelsError = "Failed to load LLM models — is the daemon running?"
        } else {
            llmModels = []
        }
        llmModelsLoaded = true
        llmModelsLoading = false
    }

    private static func parseLLMModel(_ dict: [String: Any]) -> CachedLLMModel? {
        guard let id = dict["id"] as? String else { return nil }
        let types = dict["types"] as? [String] ?? []
        let providers = dict["providers"] as? [String] ?? []
        let families = dict["model_families"] as? [String] ?? []
        let capabilities = dict["capabilities"] as? [String] ?? []
        let maxContext = dict["max_context"] as? Int
        let enabled = dict["enabled"] as? Bool ?? true
        return CachedLLMModel(
            id: id,
            types: types,
            providers: providers,
            modelFamilies: families,
            capabilities: capabilities,
            maxContext: maxContext,
            enabled: enabled
        )
    }

    // MARK: - JSON Flattening (Settings)

    private static func flattenJSON(_ dict: [String: Any], prefix: String) -> [CachedSettingField] {
        var fields: [CachedSettingField] = []

        for (key, value) in dict.sorted(by: { $0.key < $1.key }) {
            let path = prefix.isEmpty ? key : "\(prefix).\(key)"

            if let nested = value as? [String: Any] {
                fields.append(contentsOf: flattenJSON(nested, prefix: path))
            } else {
                fields.append(CachedSettingField(id: path, label: path, value: stringifyValue(value)))
            }
        }

        return fields
    }

    private static func stringifyValue(_ value: Any) -> String {
        if let str = value as? String {
            return str
        } else if let num = value as? NSNumber {
            if CFBooleanGetTypeID() == CFGetTypeID(num) {
                return num.boolValue ? "true" : "false"
            }
            return num.stringValue
        } else if let array = value as? [Any] {
            if let data = try? JSONSerialization.data(withJSONObject: array, options: []),
               let str = String(data: data, encoding: .utf8) {
                return str
            }
            return "[\(array.count) items]"
        } else if value is NSNull {
            return "null"
        } else {
            return String(describing: value)
        }
    }
}
