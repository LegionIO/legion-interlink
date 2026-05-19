import SwiftUI

// MARK: - LLM Settings Tab

struct LLMSettingsTab: View {
    @State private var settings: LLMSettings?
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
                LLMTabHelpers.errorView(error) { Task { await loadSettings() } }
            } else if let settings = Binding($settings) {
                ScrollView {
                    VStack(spacing: 12) {
                        defaultsCard(settings)
                        routingCard(settings)
                        embeddingCard(settings)
                        budgetCard(settings)
                        toolTriggerCard(settings)
                        promptCachingCard(settings)
                        contextCurationCard(settings)
                        conversationCard(settings)
                        ragCard(settings)
                        escalationCard(settings)
                        arbitrageCard(settings)
                        debateCard(settings)
                        fleetCard(settings)
                        complianceCard(settings)
                        discoveryCard(settings)
                        batchCard(settings)
                        schedulingCard(settings)
                        skillsCard(settings)
                        pipelineCard(settings)
                    }
                    .padding(16)
                }
            } else {
                LLMTabHelpers.emptyView(
                    icon: "brain",
                    message: "No LLM settings",
                    hint: "Settings will appear when the daemon is running"
                )
            }
        }
        .background(TerminalTheme.bg)
        .task { await loadSettings() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "brain")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("LLM")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

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

            LLMTabHelpers.refreshButton { Task { await loadSettings() } }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(Rectangle().fill(TerminalTheme.border).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Defaults

    private func defaultsCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("DEFAULTS")
                toggleRow("enabled", isOn: settings.enabled)
                divider
                toggleRow("pipeline enabled", isOn: settings.pipelineEnabled)
                divider
                settingRow("default tier", value: settings.defaultTier)
                divider
                settingRow("default provider", value: settings.defaultProvider)
                divider
                settingRow("default instance", value: settings.defaultInstance)
                divider
                settingRow("default model", value: settings.defaultModel)
                divider
                numericRow("max tool rounds", value: settings.maxToolRounds)
            }
        }
    }

    // MARK: - Routing

    private func routingCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("ROUTING")
                toggleRow("enabled", isOn: settings.routingEnabled)
                divider
                tierOrderRow(settings)
            }
        }
    }

    private func tierOrderRow(_ settings: Binding<LLMSettings>) -> some View {
        HStack {
            Text("tier priority")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 120, alignment: .trailing)
                .padding(.trailing, 12)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(Array(settings.wrappedValue.tierOrder.enumerated()), id: \.offset) { idx, tier in
                        HStack(spacing: 2) {
                            Text("\(idx + 1).")
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim.opacity(0.4))
                            LLMTabHelpers.tierBadge(tier)
                        }
                    }
                }
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }

    // MARK: - Embedding

    private func embeddingCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("EMBEDDING")
                settingRow("provider", value: settings.embeddingProvider)
                divider
                settingRow("instance", value: settings.embeddingInstance)
                divider
                settingRow("model", value: settings.embeddingModel)
                divider
                numericRow("dimension", value: settings.embeddingDimension)
                divider
                toggleRow("enforce dimension", isOn: settings.embeddingEnforceDimension)
            }
        }
    }

    // MARK: - Budget

    private func budgetCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("TOKEN BUDGET")
                numericRow("session max", value: settings.budgetSessionMax, format: Self.formatTokens)
                divider
                numericRow("session warn", value: settings.budgetSessionWarn, format: Self.formatTokens)
                divider
                numericRow("daily max", value: settings.budgetDailyMax, format: Self.formatTokens)
            }
        }
    }

    // MARK: - Tool Trigger

    private func toolTriggerCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("TOOL TRIGGER")
                numericRow("scan depth", value: settings.toolScanDepth)
                divider
                numericRow("tool limit", value: settings.toolLimit)
                divider
                numericRow("local tool limit", value: settings.localToolLimit)
                divider
                toggleRow("client passthrough", isOn: settings.toolClientPassthrough)
            }
        }
    }

    // MARK: - Prompt Caching

    private func promptCachingCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("PROMPT CACHING")
                toggleRow("enabled", isOn: settings.promptCachingEnabled)
                divider
                numericRow("min tokens", value: settings.promptCachingMinTokens)
                divider
                toggleRow("cache system prompt", isOn: settings.promptCacheSystem)
                divider
                toggleRow("cache tools", isOn: settings.promptCacheTools)
                divider
                toggleRow("cache conversation", isOn: settings.promptCacheConversation)
                divider
                toggleRow("sort tools", isOn: settings.promptCacheSortTools)
                divider
                toggleRow("response cache", isOn: settings.responseCacheEnabled)
                divider
                numericRow("response TTL (s)", value: settings.responseCacheTTL)
            }
        }
    }

    // MARK: - Context Curation

    private func contextCurationCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("CONTEXT CURATION")
                toggleRow("enabled", isOn: settings.curationEnabled)
                divider
                settingRow("mode", value: settings.curationMode)
                divider
                toggleRow("llm assisted", isOn: settings.curationLLMAssisted)
                divider
                numericRow("tool result max chars", value: settings.curationToolResultMaxChars)
                divider
                toggleRow("thinking eviction", isOn: settings.curationThinkingEviction)
                divider
                toggleRow("exchange folding", isOn: settings.curationExchangeFolding)
                divider
                toggleRow("superseded eviction", isOn: settings.curationSupersededEviction)
                divider
                toggleRow("dedup enabled", isOn: settings.curationDedupEnabled)
                divider
                numericRow("target context tokens", value: settings.curationTargetTokens)
                divider
                numericRow("preserve recent", value: settings.curationPreserveRecent)
            }
        }
    }

    // MARK: - Conversation

    private func conversationCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("CONVERSATION")
                numericRow("summarize threshold", value: settings.convSummarizeThreshold, format: Self.formatTokens)
                divider
                numericRow("target tokens", value: settings.convTargetTokens, format: Self.formatTokens)
                divider
                numericRow("preserve recent", value: settings.convPreserveRecent)
                divider
                toggleRow("auto compact", isOn: settings.convAutoCompact)
            }
        }
    }

    // MARK: - RAG

    private func ragCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("RAG")
                toggleRow("enabled", isOn: settings.ragEnabled)
                divider
                numericRow("full limit", value: settings.ragFullLimit)
                divider
                numericRow("compact limit", value: settings.ragCompactLimit)
            }
        }
    }

    // MARK: - Escalation

    private func escalationCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("ESCALATION")
                toggleRow("enabled", isOn: settings.escalationEnabled)
                divider
                toggleRow("pipeline enabled", isOn: settings.escalationPipelineEnabled)
                divider
                numericRow("max attempts", value: settings.escalationMaxAttempts)
            }
        }
    }

    // MARK: - Arbitrage

    private func arbitrageCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("ARBITRAGE")
                toggleRow("enabled", isOn: settings.arbitrageEnabled)
                divider
                toggleRow("prefer cheapest", isOn: settings.arbitragePreferCheapest)
            }
        }
    }

    // MARK: - Debate

    private func debateCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("DEBATE")
                toggleRow("enabled", isOn: settings.debateEnabled)
                divider
                toggleRow("gaia auto trigger", isOn: settings.debateGaiaAutoTrigger)
                divider
                numericRow("default rounds", value: settings.debateDefaultRounds)
                divider
                numericRow("max rounds", value: settings.debateMaxRounds)
                divider
                settingRow("model strategy", value: settings.debateModelStrategy)
            }
        }
    }

    // MARK: - Fleet

    private func fleetCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("FLEET DISPATCH")
                toggleRow("dispatch enabled", isOn: settings.fleetDispatchEnabled)
                divider
                numericRow("timeout (s)", value: settings.fleetTimeout)
                divider
                toggleRow("responder enabled", isOn: settings.fleetResponderEnabled)
            }
        }
    }

    // MARK: - Compliance

    private func complianceCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("COMPLIANCE")
                toggleRow("classification scan", isOn: settings.complianceClassificationScan)
                divider
                toggleRow("encrypt audit", isOn: settings.complianceEncryptAudit)
                divider
                toggleRow("PHI block cloud", isOn: settings.compliancePhiBlockCloud)
                divider
                toggleRow("redact PII", isOn: settings.complianceRedactPii)
                divider
                toggleRow("strict HIPAA", isOn: settings.complianceStrictHipaa)
            }
        }
    }

    // MARK: - Discovery

    private func discoveryCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("DISCOVERY")
                toggleRow("enabled", isOn: settings.discoveryEnabled)
                divider
                numericRow("refresh (s)", value: settings.discoveryRefreshSeconds)
                divider
                numericRow("memory floor (MB)", value: settings.discoveryMemoryFloorMB)
            }
        }
    }

    // MARK: - Batch

    private func batchCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("BATCH")
                toggleRow("enabled", isOn: settings.batchEnabled)
                divider
                numericRow("window (s)", value: settings.batchWindowSeconds)
                divider
                numericRow("max batch size", value: settings.batchMaxSize)
            }
        }
    }

    // MARK: - Scheduling

    private func schedulingCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("SCHEDULING")
                toggleRow("enabled", isOn: settings.schedulingEnabled)
                divider
                settingRow("peak hours UTC", value: settings.schedulingPeakHours)
                divider
                numericRow("max defer hours", value: settings.schedulingMaxDeferHours)
            }
        }
    }

    // MARK: - Skills

    private func skillsCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("SKILLS")
                toggleRow("enabled", isOn: settings.skillsEnabled)
                divider
                toggleRow("auto inject", isOn: settings.skillsAutoInject)
                divider
                toggleRow("on demand", isOn: settings.skillsOnDemand)
                divider
                numericRow("max active", value: settings.skillsMaxActive)
            }
        }
    }

    // MARK: - Pipeline

    private func pipelineCard(_ settings: Binding<LLMSettings>) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                sectionLabel("PIPELINE")
                toggleRow("async post-steps", isOn: settings.pipelineAsyncPostSteps)
                divider
                toggleRow("telemetry spans", isOn: settings.telemetryPipelineSpans)
            }
        }
    }

    // MARK: - Row Helpers

    private func settingRow(_ label: String, value: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 120, alignment: .trailing)
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

    private func numericRow(_ label: String, value: Binding<Int>, format: ((Int) -> String)? = nil) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 120, alignment: .trailing)
                .padding(.trailing, 12)

            HStack(spacing: 8) {
                TextField("", value: value, format: .number)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(TerminalTheme.text)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(TerminalTheme.bg.opacity(0.6))
                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
                    .cornerRadius(3)
                    .frame(maxWidth: 150)
                    .onSubmit { Task { await saveSettings() } }

                if let format {
                    Text(format(value.wrappedValue))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                }
            }

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
                .frame(width: 120, alignment: .trailing)
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

    private func sectionLabel(_ text: String) -> some View {
        LLMTabHelpers.sectionLabel(text)
    }

    private var divider: some View {
        Rectangle()
            .fill(TerminalTheme.border)
            .frame(height: 1)
            .padding(.horizontal, 12)
    }

    private static func formatTokens(_ n: Int) -> String {
        if n >= 1_000_000 { return "\(n / 1_000_000)M tokens" }
        if n >= 1_000 { return "\(n / 1_000)k tokens" }
        return "\(n) tokens"
    }

    // MARK: - Load / Save

    private func loadSettings() async {
        isLoading = true
        error = nil

        let result = await DaemonAPI.get("/api/settings")

        if result.ok, let dict = result.data as? [String: Any],
           let llm = dict["llm"] as? [String: Any] {
            settings = LLMSettings.from(llm)
        } else if !result.ok {
            error = "Failed to load LLM settings — is the daemon running?"
        }
        hasLoaded = true
        isLoading = false
    }

    private func saveSettings() async {
        guard let settings else { return }
        isSaving = true
        let dict = settings.toDict()
        Task.detached {
            let _ = SettingsFile.write("llm", content: dict)
        }
        let _ = await DaemonAPI.put("/api/settings/llm", body: dict)
        isSaving = false
    }
}

// MARK: - LLM Settings Model

struct LLMSettings {
    // Core
    var enabled: Bool
    var pipelineEnabled: Bool
    var pipelineAsyncPostSteps: Bool
    var maxToolRounds: Int
    var defaultTier: String
    var defaultProvider: String
    var defaultInstance: String
    var defaultModel: String

    // Routing
    var routingEnabled: Bool
    var tierOrder: [String]

    // Embedding
    var embeddingProvider: String
    var embeddingInstance: String
    var embeddingModel: String
    var embeddingDimension: Int
    var embeddingEnforceDimension: Bool

    // Budget
    var budgetSessionMax: Int
    var budgetSessionWarn: Int
    var budgetDailyMax: Int

    // Tool Trigger
    var toolScanDepth: Int
    var toolLimit: Int
    var localToolLimit: Int
    var toolClientPassthrough: Bool

    // Prompt Caching
    var promptCachingEnabled: Bool
    var promptCachingMinTokens: Int
    var promptCacheSystem: Bool
    var promptCacheTools: Bool
    var promptCacheConversation: Bool
    var promptCacheSortTools: Bool
    var responseCacheEnabled: Bool
    var responseCacheTTL: Int

    // Context Curation
    var curationEnabled: Bool
    var curationMode: String
    var curationLLMAssisted: Bool
    var curationToolResultMaxChars: Int
    var curationThinkingEviction: Bool
    var curationExchangeFolding: Bool
    var curationSupersededEviction: Bool
    var curationDedupEnabled: Bool
    var curationTargetTokens: Int
    var curationPreserveRecent: Int

    // Conversation
    var convSummarizeThreshold: Int
    var convTargetTokens: Int
    var convPreserveRecent: Int
    var convAutoCompact: Bool

    // RAG
    var ragEnabled: Bool
    var ragFullLimit: Int
    var ragCompactLimit: Int

    // Escalation
    var escalationEnabled: Bool
    var escalationPipelineEnabled: Bool
    var escalationMaxAttempts: Int

    // Arbitrage
    var arbitrageEnabled: Bool
    var arbitragePreferCheapest: Bool

    // Debate
    var debateEnabled: Bool
    var debateGaiaAutoTrigger: Bool
    var debateDefaultRounds: Int
    var debateMaxRounds: Int
    var debateModelStrategy: String

    // Fleet
    var fleetDispatchEnabled: Bool
    var fleetTimeout: Int
    var fleetResponderEnabled: Bool

    // Compliance
    var complianceClassificationScan: Bool
    var complianceEncryptAudit: Bool
    var compliancePhiBlockCloud: Bool
    var complianceRedactPii: Bool
    var complianceStrictHipaa: Bool

    // Discovery
    var discoveryEnabled: Bool
    var discoveryRefreshSeconds: Int
    var discoveryMemoryFloorMB: Int

    // Batch
    var batchEnabled: Bool
    var batchWindowSeconds: Int
    var batchMaxSize: Int

    // Scheduling
    var schedulingEnabled: Bool
    var schedulingPeakHours: String
    var schedulingMaxDeferHours: Int

    // Skills
    var skillsEnabled: Bool
    var skillsAutoInject: Bool
    var skillsOnDemand: Bool
    var skillsMaxActive: Int

    // Telemetry
    var telemetryPipelineSpans: Bool

    static func from(_ dict: [String: Any]) -> LLMSettings {
        let routing = dict["routing"] as? [String: Any] ?? [:]
        let escalation = routing["escalation"] as? [String: Any] ?? (dict["escalation"] as? [String: Any] ?? [:])
        let embedding = dict["embedding"] as? [String: Any] ?? [:]
        let budget = dict["budget"] as? [String: Any] ?? [:]
        let toolTrigger = dict["tool_trigger"] as? [String: Any] ?? [:]
        let promptCaching = dict["prompt_caching"] as? [String: Any] ?? [:]
        let responseCache = promptCaching["response_cache"] as? [String: Any] ?? [:]
        let curation = dict["context_curation"] as? [String: Any] ?? [:]
        let conversation = dict["conversation"] as? [String: Any] ?? [:]
        let rag = dict["rag"] as? [String: Any] ?? [:]
        let arbitrage = dict["arbitrage"] as? [String: Any] ?? [:]
        let debate = dict["debate"] as? [String: Any] ?? [:]
        let fleet = dict["fleet"] as? [String: Any] ?? [:]
        let dispatch = fleet["dispatch"] as? [String: Any] ?? [:]
        let responder = fleet["responder"] as? [String: Any] ?? [:]
        let compliance = dict["compliance"] as? [String: Any] ?? [:]
        let discovery = dict["discovery"] as? [String: Any] ?? [:]
        let batch = dict["batch"] as? [String: Any] ?? [:]
        let scheduling = dict["scheduling"] as? [String: Any] ?? [:]
        let skills = dict["skills"] as? [String: Any] ?? [:]
        let telemetry = dict["telemetry"] as? [String: Any] ?? [:]

        return LLMSettings(
            enabled: dict["enabled"] as? Bool ?? true,
            pipelineEnabled: dict["pipeline_enabled"] as? Bool ?? true,
            pipelineAsyncPostSteps: dict["pipeline_async_post_steps"] as? Bool ?? true,
            maxToolRounds: dict["max_tool_rounds"] as? Int ?? 200,
            defaultTier: dict["default_tier"] as? String ?? "",
            defaultProvider: dict["default_provider"] as? String ?? "",
            defaultInstance: dict["default_instance"] as? String ?? "",
            defaultModel: dict["default_model"] as? String ?? "",

            routingEnabled: routing["enabled"] as? Bool ?? true,
            tierOrder: routing["tier_priority"] as? [String] ?? (dict["tier_order"] as? [String] ?? []),

            embeddingProvider: embedding["provider"] as? String ?? "",
            embeddingInstance: embedding["instance"] as? String ?? "",
            embeddingModel: embedding["default_model"] as? String ?? "",
            embeddingDimension: embedding["dimension"] as? Int ?? 1024,
            embeddingEnforceDimension: embedding["enforce_dimension"] as? Bool ?? true,

            budgetSessionMax: budget["session_max_tokens"] as? Int ?? 0,
            budgetSessionWarn: budget["session_warn_tokens"] as? Int ?? 0,
            budgetDailyMax: budget["daily_max_tokens"] as? Int ?? 0,

            toolScanDepth: toolTrigger["scan_depth"] as? Int ?? 10,
            toolLimit: toolTrigger["tool_limit"] as? Int ?? 25,
            localToolLimit: toolTrigger["local_tool_limit"] as? Int ?? 100,
            toolClientPassthrough: toolTrigger["client_tool_passthrough"] as? Bool ?? false,

            promptCachingEnabled: promptCaching["enabled"] as? Bool ?? true,
            promptCachingMinTokens: promptCaching["min_tokens"] as? Int ?? 1024,
            promptCacheSystem: promptCaching["cache_system_prompt"] as? Bool ?? true,
            promptCacheTools: promptCaching["cache_tools"] as? Bool ?? true,
            promptCacheConversation: promptCaching["cache_conversation"] as? Bool ?? true,
            promptCacheSortTools: promptCaching["sort_tools"] as? Bool ?? true,
            responseCacheEnabled: responseCache["enabled"] as? Bool ?? true,
            responseCacheTTL: responseCache["ttl_seconds"] as? Int ?? 300,

            curationEnabled: curation["enabled"] as? Bool ?? true,
            curationMode: curation["mode"] as? String ?? "heuristic",
            curationLLMAssisted: curation["llm_assisted"] as? Bool ?? false,
            curationToolResultMaxChars: curation["tool_result_max_chars"] as? Int ?? 2000,
            curationThinkingEviction: curation["thinking_eviction"] as? Bool ?? true,
            curationExchangeFolding: curation["exchange_folding"] as? Bool ?? true,
            curationSupersededEviction: curation["superseded_eviction"] as? Bool ?? true,
            curationDedupEnabled: curation["dedup_enabled"] as? Bool ?? true,
            curationTargetTokens: curation["target_context_tokens"] as? Int ?? 40000,
            curationPreserveRecent: curation["archive_preserve_recent"] as? Int ?? 10,

            convSummarizeThreshold: conversation["summarize_threshold"] as? Int ?? 50000,
            convTargetTokens: conversation["target_tokens"] as? Int ?? 20000,
            convPreserveRecent: conversation["preserve_recent"] as? Int ?? 10,
            convAutoCompact: conversation["auto_compact"] as? Bool ?? true,

            ragEnabled: rag["enabled"] as? Bool ?? true,
            ragFullLimit: rag["full_limit"] as? Int ?? 10,
            ragCompactLimit: rag["compact_limit"] as? Int ?? 5,

            escalationEnabled: escalation["enabled"] as? Bool ?? true,
            escalationPipelineEnabled: escalation["pipeline_enabled"] as? Bool ?? true,
            escalationMaxAttempts: escalation["max_attempts"] as? Int ?? 3,

            arbitrageEnabled: arbitrage["enabled"] as? Bool ?? true,
            arbitragePreferCheapest: arbitrage["prefer_cheapest"] as? Bool ?? true,

            debateEnabled: debate["enabled"] as? Bool ?? false,
            debateGaiaAutoTrigger: debate["gaia_auto_trigger"] as? Bool ?? false,
            debateDefaultRounds: debate["default_rounds"] as? Int ?? 1,
            debateMaxRounds: debate["max_rounds"] as? Int ?? 3,
            debateModelStrategy: debate["model_selection_strategy"] as? String ?? "rotate",

            fleetDispatchEnabled: dispatch["enabled"] as? Bool ?? true,
            fleetTimeout: dispatch["timeout_seconds"] as? Int ?? 30,
            fleetResponderEnabled: responder["enabled"] as? Bool ?? true,

            complianceClassificationScan: compliance["classification_scan"] as? Bool ?? false,
            complianceEncryptAudit: compliance["encrypt_audit"] as? Bool ?? false,
            compliancePhiBlockCloud: compliance["phi_block_cloud"] as? Bool ?? false,
            complianceRedactPii: compliance["redact_pii"] as? Bool ?? false,
            complianceStrictHipaa: compliance["strict_hipaa"] as? Bool ?? false,

            discoveryEnabled: discovery["enabled"] as? Bool ?? true,
            discoveryRefreshSeconds: discovery["refresh_seconds"] as? Int ?? 60,
            discoveryMemoryFloorMB: discovery["memory_floor_mb"] as? Int ?? 2048,

            batchEnabled: batch["enabled"] as? Bool ?? false,
            batchWindowSeconds: batch["window_seconds"] as? Int ?? 300,
            batchMaxSize: batch["max_batch_size"] as? Int ?? 100,

            schedulingEnabled: scheduling["enabled"] as? Bool ?? false,
            schedulingPeakHours: scheduling["peak_hours_utc"] as? String ?? "14-22",
            schedulingMaxDeferHours: scheduling["max_defer_hours"] as? Int ?? 8,

            skillsEnabled: skills["enabled"] as? Bool ?? true,
            skillsAutoInject: skills["auto_inject"] as? Bool ?? true,
            skillsOnDemand: skills["on_demand"] as? Bool ?? true,
            skillsMaxActive: skills["max_active_skills"] as? Int ?? 1,

            telemetryPipelineSpans: telemetry["pipeline_spans"] as? Bool ?? true
        )
    }

    func toDict() -> [String: Any] {
        [
            "enabled": enabled,
            "pipeline_enabled": pipelineEnabled,
            "pipeline_async_post_steps": pipelineAsyncPostSteps,
            "max_tool_rounds": maxToolRounds,
            "default_tier": defaultTier,
            "default_provider": defaultProvider,
            "default_instance": defaultInstance,
            "default_model": defaultModel,
            "routing": [
                "enabled": routingEnabled,
                "tier_priority": tierOrder
            ],
            "embedding": [
                "provider": embeddingProvider,
                "instance": embeddingInstance,
                "default_model": embeddingModel,
                "dimension": embeddingDimension,
                "enforce_dimension": embeddingEnforceDimension
            ],
            "budget": [
                "session_max_tokens": budgetSessionMax,
                "session_warn_tokens": budgetSessionWarn,
                "daily_max_tokens": budgetDailyMax
            ],
            "tool_trigger": [
                "scan_depth": toolScanDepth,
                "tool_limit": toolLimit,
                "local_tool_limit": localToolLimit,
                "client_tool_passthrough": toolClientPassthrough
            ],
            "prompt_caching": [
                "enabled": promptCachingEnabled,
                "min_tokens": promptCachingMinTokens,
                "cache_system_prompt": promptCacheSystem,
                "cache_tools": promptCacheTools,
                "cache_conversation": promptCacheConversation,
                "sort_tools": promptCacheSortTools,
                "response_cache": [
                    "enabled": responseCacheEnabled,
                    "ttl_seconds": responseCacheTTL
                ]
            ],
            "context_curation": [
                "enabled": curationEnabled,
                "mode": curationMode,
                "llm_assisted": curationLLMAssisted,
                "tool_result_max_chars": curationToolResultMaxChars,
                "thinking_eviction": curationThinkingEviction,
                "exchange_folding": curationExchangeFolding,
                "superseded_eviction": curationSupersededEviction,
                "dedup_enabled": curationDedupEnabled,
                "target_context_tokens": curationTargetTokens,
                "archive_preserve_recent": curationPreserveRecent
            ],
            "conversation": [
                "summarize_threshold": convSummarizeThreshold,
                "target_tokens": convTargetTokens,
                "preserve_recent": convPreserveRecent,
                "auto_compact": convAutoCompact
            ],
            "rag": [
                "enabled": ragEnabled,
                "full_limit": ragFullLimit,
                "compact_limit": ragCompactLimit
            ],
            "escalation": [
                "enabled": escalationEnabled,
                "pipeline_enabled": escalationPipelineEnabled,
                "max_attempts": escalationMaxAttempts
            ],
            "arbitrage": [
                "enabled": arbitrageEnabled,
                "prefer_cheapest": arbitragePreferCheapest
            ],
            "debate": [
                "enabled": debateEnabled,
                "gaia_auto_trigger": debateGaiaAutoTrigger,
                "default_rounds": debateDefaultRounds,
                "max_rounds": debateMaxRounds,
                "model_selection_strategy": debateModelStrategy
            ],
            "fleet": [
                "dispatch": [
                    "enabled": fleetDispatchEnabled,
                    "timeout_seconds": fleetTimeout
                ],
                "responder": [
                    "enabled": fleetResponderEnabled
                ]
            ],
            "compliance": [
                "classification_scan": complianceClassificationScan,
                "encrypt_audit": complianceEncryptAudit,
                "phi_block_cloud": compliancePhiBlockCloud,
                "redact_pii": complianceRedactPii,
                "strict_hipaa": complianceStrictHipaa
            ],
            "discovery": [
                "enabled": discoveryEnabled,
                "refresh_seconds": discoveryRefreshSeconds,
                "memory_floor_mb": discoveryMemoryFloorMB
            ],
            "batch": [
                "enabled": batchEnabled,
                "window_seconds": batchWindowSeconds,
                "max_batch_size": batchMaxSize
            ],
            "scheduling": [
                "enabled": schedulingEnabled,
                "peak_hours_utc": schedulingPeakHours,
                "max_defer_hours": schedulingMaxDeferHours
            ],
            "skills": [
                "enabled": skillsEnabled,
                "auto_inject": skillsAutoInject,
                "on_demand": skillsOnDemand,
                "max_active_skills": skillsMaxActive
            ],
            "telemetry": [
                "pipeline_spans": telemetryPipelineSpans
            ]
        ]
    }
}
