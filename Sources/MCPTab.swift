import SwiftUI

// MARK: - MCP Tab

struct MCPTab: View {
    @State private var settings: MCPSettings?
    @State private var servers: [MCPServer] = []
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var error: String?
    @State private var hasLoaded = false
    @State private var expandedSection: MCPSection? = .settings

    enum MCPSection: String, CaseIterable {
        case settings = "Settings"
        case servers = "Servers"
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            if isLoading && !hasLoaded {
                LLMTabHelpers.loadingView
            } else if let error {
                LLMTabHelpers.errorView(error) { Task { await loadAll() } }
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        settingsAccordion
                        serversAccordion
                    }
                    .padding(16)
                }
            }
        }
        .background(TerminalTheme.bg)
        .task { await loadAll() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "link.circle")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("MCP")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if !servers.isEmpty {
                LLMTabHelpers.countBadge(servers.count)
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

    // MARK: - Settings Accordion

    private var settingsAccordion: some View {
        HoverCard {
            VStack(spacing: 0) {
                accordionHeader("SETTINGS", icon: "gearshape", section: .settings)

                if expandedSection == .settings, let settings = Binding($settings) {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 12)

                    VStack(alignment: .leading, spacing: 0) {
                        coreSettingsSection(settings)
                        divider
                        deferredLoadingSection(settings)
                        divider
                        dynamicToolsSection(settings)
                        divider
                        selfGenerateSection(settings)
                    }
                }
            }
        }
    }

    private func coreSettingsSection(_ settings: Binding<MCPSettings>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LLMTabHelpers.sectionLabel("CORE")
            numericRow("tool cache TTL (s)", value: settings.toolCacheTTL)
            innerDivider
            numericRow("connect timeout (s)", value: settings.connectTimeout)
            innerDivider
            numericRow("call timeout (s)", value: settings.callTimeout)
            innerDivider
            toggleRow("auto expose runners", isOn: settings.autoExposeRunners)
        }
    }

    private func deferredLoadingSection(_ settings: Binding<MCPSettings>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LLMTabHelpers.sectionLabel("DEFERRED LOADING")
            toggleRow("enabled", isOn: settings.deferredLoadingEnabled)
        }
    }

    private func dynamicToolsSection(_ settings: Binding<MCPSettings>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LLMTabHelpers.sectionLabel("DYNAMIC TOOLS")
            toggleRow("enabled", isOn: settings.dynamicToolsEnabled)
            innerDivider
            numericRow("max injected", value: settings.dynamicToolsMaxInjected)
        }
    }

    private func selfGenerateSection(_ settings: Binding<MCPSettings>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LLMTabHelpers.sectionLabel("SELF-GENERATE (CODEGEN)")
            toggleRow("enabled", isOn: settings.selfGenerateEnabled)
            innerDivider
            numericRow("cooldown (s)", value: settings.selfGenerateCooldown)
            innerDivider
            numericRow("max gaps/cycle", value: settings.selfGenerateMaxGaps)
            innerDivider
            toggleRow("syntax check", isOn: settings.validationSyntaxCheck)
            innerDivider
            toggleRow("run specs", isOn: settings.validationRunSpecs)
            innerDivider
            toggleRow("LLM review", isOn: settings.validationLLMReview)
            innerDivider
            toggleRow("corroboration", isOn: settings.corroborationEnabled)
            innerDivider
            numericRow("min agents", value: settings.corroborationMinAgents)
            innerDivider
            toggleRow("GitHub auto PR", isOn: settings.githubAutoPR)
            innerDivider
            toggleRow("GitHub auto merge", isOn: settings.githubAutoMerge)
        }
    }

    // MARK: - Servers Accordion

    private var serversAccordion: some View {
        HoverCard {
            VStack(spacing: 0) {
                accordionHeader("SERVERS", icon: "server.rack", section: .servers)

                if expandedSection == .servers {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 12)

                    if servers.isEmpty {
                        HStack {
                            Spacer()
                            Text("no MCP servers configured")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    } else {
                        VStack(spacing: 6) {
                            ForEach(servers) { server in
                                serverCard(server)
                            }
                        }
                        .padding(12)
                    }
                }
            }
        }
    }

    private func serverCard(_ server: MCPServer) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(TerminalTheme.green)
                    .frame(width: 6, height: 6)

                Text(server.name)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(TerminalTheme.text)

                Spacer()

                if !server.transport.isEmpty {
                    Text(server.transport)
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(TerminalTheme.surfaceBg)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
                        .cornerRadius(3)
                }
            }

            if !server.command.isEmpty {
                Text(server.command)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.7))
                    .lineLimit(1)
                    .padding(.top, 3)
                    .padding(.leading, 14)
            }

            if !server.args.isEmpty {
                Text(server.args.joined(separator: " "))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                    .lineLimit(2)
                    .padding(.top, 2)
                    .padding(.leading, 14)
            }
        }
        .padding(10)
        .background(TerminalTheme.bg.opacity(0.5))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(TerminalTheme.border, lineWidth: 1))
        .cornerRadius(4)
    }

    // MARK: - Accordion Header

    private func accordionHeader(_ title: String, icon: String, section: MCPSection) -> some View {
        Button(action: {
            withAnimation(.easeInOut(duration: 0.2)) {
                expandedSection = expandedSection == section ? nil : section
            }
        }) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                    .foregroundColor(TerminalTheme.accent)

                Text(title)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)

                Spacer()

                Image(systemName: expandedSection == section ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Row Helpers

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
        .padding(.vertical, 4)
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
        .padding(.vertical, 4)
    }

    private var divider: some View {
        Rectangle()
            .fill(TerminalTheme.border)
            .frame(height: 1)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
    }

    private var innerDivider: some View {
        Rectangle()
            .fill(TerminalTheme.border.opacity(0.5))
            .frame(height: 1)
            .padding(.horizontal, 20)
    }

    // MARK: - Load / Save

    private func loadAll() async {
        isLoading = true
        error = nil

        let result = await DaemonAPI.get("/api/settings")

        if result.ok, let dict = result.data as? [String: Any],
           let mcp = dict["mcp"] as? [String: Any] {
            settings = MCPSettings.from(mcp)
            servers = MCPServer.parseServers(mcp["servers"] as? [String: Any] ?? [:])
        } else if !result.ok {
            error = "Failed to load MCP settings — is the daemon running?"
        }

        hasLoaded = true
        isLoading = false
    }

    private func saveSettings() async {
        guard let settings else { return }
        isSaving = true
        var dict = settings.toDict()
        // Preserve existing servers in the file (we don't edit them here)
        if let existing = SettingsFile.read("mcp"),
           let existingServers = existing["servers"] {
            dict["servers"] = existingServers
        }
        Task.detached {
            let _ = SettingsFile.write("mcp", content: dict)
        }
        let _ = await DaemonAPI.put("/api/settings/mcp", body: dict)
        isSaving = false
    }
}

// MARK: - MCP Server Model

struct MCPServer: Identifiable {
    let id: String
    let name: String
    let command: String
    let args: [String]
    let transport: String

    static func parseServers(_ dict: [String: Any]) -> [MCPServer] {
        dict.compactMap { key, value in
            guard let config = value as? [String: Any] else { return nil }
            let command = config["command"] as? String ?? ""
            let args = config["args"] as? [String] ?? []
            let transport = config["transport"] as? String ?? (command.isEmpty ? "sse" : "stdio")
            return MCPServer(id: key, name: key, command: command, args: args, transport: transport)
        }
        .sorted { $0.name < $1.name }
    }
}

// MARK: - MCP Settings Model

struct MCPSettings {
    var toolCacheTTL: Int
    var connectTimeout: Int
    var callTimeout: Int
    var autoExposeRunners: Bool

    var deferredLoadingEnabled: Bool
    var dynamicToolsEnabled: Bool
    var dynamicToolsMaxInjected: Int

    var selfGenerateEnabled: Bool
    var selfGenerateCooldown: Int
    var selfGenerateMaxGaps: Int
    var validationSyntaxCheck: Bool
    var validationRunSpecs: Bool
    var validationLLMReview: Bool
    var corroborationEnabled: Bool
    var corroborationMinAgents: Int
    var githubAutoPR: Bool
    var githubAutoMerge: Bool

    static func from(_ dict: [String: Any]) -> MCPSettings {
        let mcpInner = dict["mcp"] as? [String: Any] ?? [:]
        let deferred = mcpInner["deferred_loading"] as? [String: Any] ?? [:]
        let dynamic = mcpInner["dynamic_tools"] as? [String: Any] ?? [:]
        let codegen = dict["codegen"] as? [String: Any] ?? [:]
        let selfGen = codegen["self_generate"] as? [String: Any] ?? [:]
        let validation = selfGen["validation"] as? [String: Any] ?? [:]
        let corroboration = selfGen["corroboration"] as? [String: Any] ?? [:]
        let github = selfGen["github"] as? [String: Any] ?? [:]

        return MCPSettings(
            toolCacheTTL: dict["tool_cache_ttl"] as? Int ?? 300,
            connectTimeout: dict["connect_timeout"] as? Int ?? 10,
            callTimeout: dict["call_timeout"] as? Int ?? 30,
            autoExposeRunners: mcpInner["auto_expose_runners"] as? Bool ?? false,

            deferredLoadingEnabled: deferred["enabled"] as? Bool ?? true,
            dynamicToolsEnabled: dynamic["enabled"] as? Bool ?? false,
            dynamicToolsMaxInjected: dynamic["max_injected"] as? Int ?? 10,

            selfGenerateEnabled: selfGen["enabled"] as? Bool ?? false,
            selfGenerateCooldown: selfGen["cooldown_seconds"] as? Int ?? 300,
            selfGenerateMaxGaps: selfGen["max_gaps_per_cycle"] as? Int ?? 5,
            validationSyntaxCheck: validation["syntax_check"] as? Bool ?? true,
            validationRunSpecs: validation["run_specs"] as? Bool ?? true,
            validationLLMReview: validation["llm_review"] as? Bool ?? true,
            corroborationEnabled: corroboration["enabled"] as? Bool ?? true,
            corroborationMinAgents: corroboration["min_agents"] as? Int ?? 2,
            githubAutoPR: github["auto_pr"] as? Bool ?? true,
            githubAutoMerge: github["auto_merge"] as? Bool ?? false
        )
    }

    func toDict() -> [String: Any] {
        [
            "tool_cache_ttl": toolCacheTTL,
            "connect_timeout": connectTimeout,
            "call_timeout": callTimeout,
            "mcp": [
                "auto_expose_runners": autoExposeRunners,
                "deferred_loading": ["enabled": deferredLoadingEnabled],
                "dynamic_tools": [
                    "enabled": dynamicToolsEnabled,
                    "max_injected": dynamicToolsMaxInjected
                ]
            ],
            "codegen": [
                "self_generate": [
                    "enabled": selfGenerateEnabled,
                    "cooldown_seconds": selfGenerateCooldown,
                    "max_gaps_per_cycle": selfGenerateMaxGaps,
                    "validation": [
                        "syntax_check": validationSyntaxCheck,
                        "run_specs": validationRunSpecs,
                        "llm_review": validationLLMReview
                    ],
                    "corroboration": [
                        "enabled": corroborationEnabled,
                        "min_agents": corroborationMinAgents
                    ],
                    "github": [
                        "auto_pr": githubAutoPR,
                        "auto_merge": githubAutoMerge
                    ]
                ]
            ]
        ]
    }
}
