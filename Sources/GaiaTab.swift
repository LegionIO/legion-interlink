import SwiftUI

// MARK: - GAIA Tab

struct GaiaTab: View {
    @State private var settings: GaiaSettings?
    @State private var status: GaiaStatus?
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var error: String?
    @State private var hasLoaded = false

    var body: some View {
        VStack(spacing: 0) {
            header

            if isLoading && !hasLoaded {
                LLMTabHelpers.loadingView
            } else if let error {
                LLMTabHelpers.errorView(error) { Task { await loadAll() } }
            } else if let settings = Binding($settings) {
                ScrollView {
                    VStack(spacing: 12) {
                        if let status {
                            statusCard(status)
                        }
                        coreCard(settings)
                        sessionCard(settings)
                        channelsCard(settings)
                        outputCard(settings)
                        notificationsCard(settings)
                        knowledgeCard(settings)
                        routerCard(settings)
                    }
                    .padding(16)
                }
            } else {
                LLMTabHelpers.emptyView(
                    icon: "bubble.left.and.bubble.right",
                    message: "No GAIA settings",
                    hint: "Settings will appear when the daemon is running"
                )
            }
        }
        .background(TerminalTheme.bg)
        .task { await loadAll() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("GAIA")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if let status {
                let color = status.state == "active" ? TerminalTheme.green : TerminalTheme.gray
                HStack(spacing: 4) {
                    Circle()
                        .fill(color)
                        .frame(width: 6, height: 6)
                    Text(status.state)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(color)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(color.opacity(0.1))
                .cornerRadius(3)
            }

            Spacer()

            if isSaving {
                HStack(spacing: 4) {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.7)
                    Text("saving...")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                }
            }

            LLMTabHelpers.refreshButton { Task { await loadAll() } }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(Rectangle().fill(TerminalTheme.border).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Status Card (live from /api/gaia/status)

    private func statusCard(_ status: GaiaStatus) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("STATUS")
                LLMTabHelpers.kv("state", status.state)
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kv("sessions", "\(status.activeSessions)")
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kv("channels", status.channels.joined(separator: ", "))
                if !status.bufferSize.isEmpty {
                    LLMTabHelpers.kvDivider
                    LLMTabHelpers.kv("buffer", status.bufferSize)
                }
            }
        }
    }

    // MARK: - Core

    private func coreCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("CORE")
                toggleRow("enabled", isOn: settings.enabled)
                divider
                numericRow("heartbeat interval (s)", value: settings.heartbeatInterval)
                divider
                numericRow("shutdown wait timeout", value: settings.shutdownWaitTimeout)
            }
        }
    }

    // MARK: - Session

    private func sessionCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("SESSION")
                settingRow("persistence", value: settings.sessionPersistence)
                divider
                numericRow("TTL (s)", value: settings.sessionTTL)
            }
        }
    }

    // MARK: - Channels

    private func channelsCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("CHANNELS")
                toggleRow("CLI", isOn: settings.channelCLI)
                divider
                toggleRow("Teams", isOn: settings.channelTeams)
                divider
                toggleRow("Slack", isOn: settings.channelSlack)
            }
        }
    }

    // MARK: - Output

    private func outputCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("OUTPUT")
                numericRow("mobile max length", value: settings.outputMobileMaxLength)
                divider
                toggleRow("suggest channel switch", isOn: settings.outputSuggestChannelSwitch)
            }
        }
    }

    // MARK: - Notifications

    private func notificationsCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("NOTIFICATIONS")
                toggleRow("enabled", isOn: settings.notificationsEnabled)
                divider
                toggleRow("quiet hours", isOn: settings.quietHoursEnabled)
                divider
                numericRow("delay queue max", value: settings.delayQueueMax)
                divider
                numericRow("max delay (s)", value: settings.maxDelay)
            }
        }
    }

    // MARK: - Knowledge

    private func knowledgeCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("KNOWLEDGE")
                numericRow("retrieval limit", value: settings.knowledgeRetrievalLimit)
                divider
                numericRow("memory retrieval limit", value: settings.memoryRetrievalLimit)
                divider
                numericRow("memory audit limit", value: settings.memoryAuditLimit)
            }
        }
    }

    // MARK: - Router

    private func routerCard(_ settings: Binding<GaiaSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("ROUTER")
                toggleRow("mode", isOn: settings.routerMode)
            }
        }
    }

    // MARK: - Row Helpers

    private func settingRow(_ label: String, value: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 140, alignment: .trailing)
                .padding(.trailing, 12)

            TextField("", text: value, onCommit: { Task { await saveSettings() } })
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(TerminalTheme.bg.opacity(0.6))
                .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
                .cornerRadius(3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }

    private func numericRow(_ label: String, value: Binding<Int>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 140, alignment: .trailing)
                .padding(.trailing, 12)

            TextField("", value: value, format: .number)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(TerminalTheme.bg.opacity(0.6))
                .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
                .cornerRadius(3)
                .frame(maxWidth: 120)
                .onSubmit { Task { await saveSettings() } }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }

    private func toggleRow(_ label: String, isOn: Binding<Bool>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 140, alignment: .trailing)
                .padding(.trailing, 12)

            Toggle("", isOn: isOn)
                .toggleStyle(TerminalCheckboxStyle())
                .onChange(of: isOn.wrappedValue) { _ in
                    Task { await saveSettings() }
                }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }

    private var divider: some View {
        Rectangle()
            .fill(TerminalTheme.border)
            .frame(height: 1)
            .padding(.horizontal, 12)
    }

    // MARK: - Load / Save

    private func loadAll() async {
        isLoading = true
        error = nil

        async let settingsResult = DaemonAPI.get("/api/settings")
        async let statusResult = DaemonAPI.get("/api/gaia/status")

        let sResult = await settingsResult
        let stResult = await statusResult

        if sResult.ok, let dict = sResult.data as? [String: Any],
           let gaia = dict["gaia"] as? [String: Any] {
            settings = GaiaSettings.from(gaia)
        } else if !sResult.ok {
            error = "Failed to load GAIA settings — is the daemon running?"
        }

        if stResult.ok, let dict = stResult.data as? [String: Any] {
            status = GaiaStatus.from(dict)
        }

        hasLoaded = true
        isLoading = false
    }

    private func saveSettings() async {
        guard let settings else { return }
        isSaving = true
        let dict = settings.toDict()
        Task.detached {
            let _ = SettingsFile.write("gaia", content: dict)
        }
        let _ = await DaemonAPI.put("/api/settings/gaia", body: dict)
        isSaving = false
    }
}

// MARK: - GAIA Status Model

struct GaiaStatus {
    let state: String
    let activeSessions: Int
    let channels: [String]
    let bufferSize: String

    static func from(_ dict: [String: Any]) -> GaiaStatus {
        GaiaStatus(
            state: dict["state"] as? String ?? dict["status"] as? String ?? "unknown",
            activeSessions: dict["active_sessions"] as? Int ?? dict["sessions"] as? Int ?? 0,
            channels: dict["channels"] as? [String] ?? dict["active_channels"] as? [String] ?? [],
            bufferSize: dict["buffer_size"] as? String ?? (dict["buffer_count"] as? Int).map { "\($0) items" } ?? ""
        )
    }
}

// MARK: - GAIA Settings Model

struct GaiaSettings {
    var enabled: Bool
    var heartbeatInterval: Int
    var shutdownWaitTimeout: Int

    var sessionPersistence: String
    var sessionTTL: Int

    var channelCLI: Bool
    var channelTeams: Bool
    var channelSlack: Bool

    var outputMobileMaxLength: Int
    var outputSuggestChannelSwitch: Bool

    var notificationsEnabled: Bool
    var quietHoursEnabled: Bool
    var delayQueueMax: Int
    var maxDelay: Int

    var knowledgeRetrievalLimit: Int
    var memoryRetrievalLimit: Int
    var memoryAuditLimit: Int

    var routerMode: Bool

    static func from(_ dict: [String: Any]) -> GaiaSettings {
        let shutdown = dict["shutdown"] as? [String: Any] ?? [:]
        let session = dict["session"] as? [String: Any] ?? [:]
        let channels = dict["channels"] as? [String: Any] ?? [:]
        let cli = channels["cli"] as? [String: Any] ?? [:]
        let teams = channels["teams"] as? [String: Any] ?? [:]
        let slack = channels["slack"] as? [String: Any] ?? [:]
        let output = dict["output"] as? [String: Any] ?? [:]
        let notifications = dict["notifications"] as? [String: Any] ?? [:]
        let quietHours = notifications["quiet_hours"] as? [String: Any] ?? [:]
        let knowledge = dict["knowledge"] as? [String: Any] ?? [:]
        let router = dict["router"] as? [String: Any] ?? [:]

        return GaiaSettings(
            enabled: dict["enabled"] as? Bool ?? true,
            heartbeatInterval: dict["heartbeat_interval"] as? Int ?? 1,
            shutdownWaitTimeout: (shutdown["heartbeat_wait_timeout"] as? Double).map { Int($0) } ?? 30,

            sessionPersistence: session["persistence"] as? String ?? "auto",
            sessionTTL: session["ttl"] as? Int ?? 86400,

            channelCLI: cli["enabled"] as? Bool ?? true,
            channelTeams: teams["enabled"] as? Bool ?? false,
            channelSlack: slack["enabled"] as? Bool ?? false,

            outputMobileMaxLength: output["mobile_max_length"] as? Int ?? 500,
            outputSuggestChannelSwitch: output["suggest_channel_switch"] as? Bool ?? true,

            notificationsEnabled: notifications["enabled"] as? Bool ?? true,
            quietHoursEnabled: quietHours["enabled"] as? Bool ?? false,
            delayQueueMax: notifications["delay_queue_max"] as? Int ?? 100,
            maxDelay: notifications["max_delay"] as? Int ?? 14400,

            knowledgeRetrievalLimit: knowledge["retrieval_limit"] as? Int ?? 5,
            memoryRetrievalLimit: knowledge["memory_retrieval_limit"] as? Int ?? 10,
            memoryAuditLimit: knowledge["memory_audit_limit"] as? Int ?? 20,

            routerMode: router["mode"] as? Bool ?? false
        )
    }

    func toDict() -> [String: Any] {
        [
            "enabled": enabled,
            "heartbeat_interval": heartbeatInterval,
            "shutdown": ["heartbeat_wait_timeout": Double(shutdownWaitTimeout)],
            "session": ["persistence": sessionPersistence, "ttl": sessionTTL],
            "channels": [
                "cli": ["enabled": channelCLI],
                "teams": ["enabled": channelTeams],
                "slack": ["enabled": channelSlack]
            ],
            "output": [
                "mobile_max_length": outputMobileMaxLength,
                "suggest_channel_switch": outputSuggestChannelSwitch
            ],
            "notifications": [
                "enabled": notificationsEnabled,
                "quiet_hours": ["enabled": quietHoursEnabled],
                "delay_queue_max": delayQueueMax,
                "max_delay": maxDelay
            ],
            "knowledge": [
                "retrieval_limit": knowledgeRetrievalLimit,
                "memory_retrieval_limit": memoryRetrievalLimit,
                "memory_audit_limit": memoryAuditLimit
            ],
            "router": ["mode": routerMode]
        ]
    }
}
