import SwiftUI

// MARK: - Identity Tab

struct IdentityTab: View {
    @StateObject private var cache = DaemonCache.shared

    var body: some View {
        VStack(spacing: 0) {
            header

            if cache.identityLoading && !cache.identityLoaded {
                LLMTabHelpers.loadingView
            } else if let error = cache.identityError {
                LLMTabHelpers.errorView(error) { Task { await cache.loadIdentity(force: true) } }
            } else if let identity = cache.identity {
                ScrollView {
                    VStack(spacing: 12) {
                        summaryCard(identity)
                        providersCard(identity)
                    }
                    .padding(16)
                }
            } else {
                LLMTabHelpers.emptyView(icon: "person.badge.key",
                                        message: "No identity data",
                                        hint: "Identity will appear when the daemon is running")
            }
        }
        .background(TerminalTheme.bg)
        .task { await cache.loadIdentity() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.badge.key")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("IDENTITY")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            Spacer()

            LLMTabHelpers.refreshButton { Task { await cache.loadIdentity(force: true) } }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(Rectangle().fill(TerminalTheme.border).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Summary Card

    private func summaryCard(_ identity: CachedIdentity) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("SESSION")
                LLMTabHelpers.kv("user", identity.canonicalName)
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kv("id", identity.id)
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kv("kind", identity.kind)
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kv("mode", identity.mode)
                LLMTabHelpers.kvDivider
                LLMTabHelpers.kvTagged("trust", identity.trust, tagColor: trustColor(identity.trust))
            }
        }
    }

    // MARK: - Auth Providers Card

    private func providersCard(_ identity: CachedIdentity) -> some View {
        HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                LLMTabHelpers.sectionLabel("AUTH PROVIDERS")
                ForEach(Array(identity.registeredProviders.enumerated()), id: \.element.id) { idx, provider in
                    if idx > 0 {
                        Rectangle()
                            .fill(TerminalTheme.border)
                            .frame(height: 1)
                            .padding(.horizontal, 12)
                    }
                    providerRow(provider)
                }
            }
        }
    }

    private func providerRow(_ provider: CachedIdentityProvider) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                let color = providerStatusColor(provider.status)
                Circle()
                    .fill(color)
                    .frame(width: 7, height: 7)
                    .shadow(color: color.opacity(0.5), radius: 3)

                Text(provider.id)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(TerminalTheme.text)

                Spacer()

                HStack(spacing: 4) {
                    Text(provider.type)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(TerminalTheme.cardBg)
                        .cornerRadius(3)

                    Text(provider.trustLevel)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(trustColor(provider.trustLevel))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(trustColor(provider.trustLevel).opacity(0.1))
                        .cornerRadius(3)
                }
            }

            if let status = provider.status {
                let sc = providerStatusColor(status)
                Text(status.replacingOccurrences(of: "_", with: " "))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(sc)
            }

            if !provider.capabilities.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(provider.capabilities, id: \.self) { cap in
                            LLMTabHelpers.capBadge(cap, color: TerminalTheme.accent)
                        }
                    }
                }
            }
        }
        .padding(12)
    }

    private func trustColor(_ trust: String) -> Color {
        switch trust {
        case "verified":   return TerminalTheme.green
        case "unverified": return TerminalTheme.yellow
        default:           return TerminalTheme.gray
        }
    }

    private func providerStatusColor(_ status: String?) -> Color {
        switch status {
        case "resolved":    return TerminalTheme.green
        case "no_identity": return TerminalTheme.gray
        default:            return TerminalTheme.yellow
        }
    }
}

// MARK: - LLM Providers Tab (Accordion Providers → Models)

struct LLMProvidersTab: View {
    @StateObject private var cache = DaemonCache.shared
    @State private var searchText = ""
    @State private var expandedProviders: Set<String> = []

    var body: some View {
        VStack(spacing: 0) {
            header

            if cache.llmProvidersLoading && !cache.llmProvidersLoaded {
                LLMTabHelpers.loadingView
            } else if let error = cache.llmProvidersError {
                LLMTabHelpers.errorView(error) { Task { await cache.loadLLMProviders(force: true) } }
            } else if filteredProviders.isEmpty {
                LLMTabHelpers.emptyView(icon: "cpu",
                                        message: "No providers found",
                                        hint: "LLM providers will appear when the daemon is running")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filteredProviders) { provider in
                            ProviderAccordionCard(
                                provider: provider,
                                isExpanded: expandedProviders.contains(provider.id),
                                onToggle: { toggleExpanded(provider.id) }
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .background(TerminalTheme.bg)
        .task { await cache.loadLLMProviders() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("LLM")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if !cache.llmProviders.isEmpty {
                LLMTabHelpers.countBadge(cache.llmProviders.count)
            }

            Spacer()

            TerminalSearchBox(text: $searchText)

            LLMTabHelpers.refreshButton {
                Task {
                    await cache.loadLLMProviders(force: true)
                    cache.clearProviderModels()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(Rectangle().fill(TerminalTheme.border).frame(height: 1), alignment: .bottom)
    }

    private var filteredProviders: [CachedLLMProvider] {
        guard !searchText.isEmpty else { return cache.llmProviders }
        let q = searchText.lowercased()
        return cache.llmProviders.filter {
            $0.provider.lowercased().contains(q) ||
            $0.instance.lowercased().contains(q) ||
            $0.tier.lowercased().contains(q)
        }
    }

    private func toggleExpanded(_ id: String) {
        withAnimation(.easeInOut(duration: 0.2)) {
            if expandedProviders.contains(id) {
                expandedProviders.remove(id)
            } else {
                expandedProviders.insert(id)
            }
        }
    }
}

// MARK: - Provider Accordion Card

private struct ProviderAccordionCard: View {
    let provider: CachedLLMProvider
    let isExpanded: Bool
    let onToggle: () -> Void

    @StateObject private var cache = DaemonCache.shared

    private var stateOk: Bool { provider.circuitState == "closed" }
    private var stateColor: Color { stateOk ? TerminalTheme.green : TerminalTheme.red }

    private var models: [CachedLLMModel] {
        cache.providerModels[provider.provider] ?? []
    }
    private var modelsLoading: Bool {
        cache.providerModelsLoading[provider.provider] ?? false
    }

    var body: some View {
        HoverCard {
            VStack(spacing: 0) {
                providerHeader
                if isExpanded {
                    modelsSection
                }
            }
        }
        .onChange(of: isExpanded) { expanded in
            if expanded && cache.providerModels[provider.provider] == nil {
                Task { await cache.loadProviderModels(provider.provider) }
            }
        }
    }

    // MARK: - Provider Header (clickable)

    private var providerHeader: some View {
        Button(action: onToggle) {
            HStack(spacing: 10) {
                Circle()
                    .fill(stateColor)
                    .frame(width: 7, height: 7)
                    .shadow(color: stateColor.opacity(0.5), radius: 3)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(provider.provider)
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(TerminalTheme.text)
                        Text(provider.instance)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(TerminalTheme.accent.opacity(0.8))
                    }

                    HStack(spacing: 6) {
                        if let fp = provider.credentialFingerprint {
                            Text("key:\(fp)")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim)
                        }
                        ForEach(provider.capabilities.prefix(4), id: \.self) { cap in
                            LLMTabHelpers.capBadge(cap)
                        }
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    LLMTabHelpers.tierBadge(provider.tier)
                    Text(provider.circuitState)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(stateColor)
                }

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Models Section (accordion body)

    private var modelsSection: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1)
                .padding(.horizontal, 12)

            if modelsLoading {
                HStack {
                    Spacer()
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.7)
                    Text("loading models...")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                    Spacer()
                }
                .padding(.vertical, 10)
            } else if models.isEmpty {
                Text("no models registered")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                    .padding(.vertical, 10)
            } else {
                VStack(spacing: 4) {
                    ForEach(models) { model in
                        modelRow(model)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
        }
    }

    private func modelRow(_ model: CachedLLMModel) -> some View {
        HStack(spacing: 8) {
            // Type badge(s)
            HStack(spacing: 2) {
                ForEach(model.types, id: \.self) { t in
                    let isInfer = t == "inference"
                    Text(isInfer ? "INF" : "EMB")
                        .font(.system(size: 7, weight: .bold, design: .monospaced))
                        .foregroundColor(isInfer ? TerminalTheme.accent : TerminalTheme.yellow)
                        .frame(width: 26)
                        .padding(.vertical, 2)
                        .background(isInfer
                            ? TerminalTheme.accent.opacity(0.12)
                            : TerminalTheme.yellow.opacity(0.12))
                        .cornerRadius(2)
                }
            }

            Text(model.id)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .lineLimit(1)

            Spacer()

            if let ctx = model.maxContext {
                Text(Self.formatContext(ctx))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)
            }

            if !model.capabilities.isEmpty {
                HStack(spacing: 2) {
                    ForEach(model.capabilities.prefix(2), id: \.self) { cap in
                        LLMTabHelpers.capBadge(cap)
                    }
                }
            }

            Circle()
                .fill(model.enabled ? TerminalTheme.green : TerminalTheme.red)
                .frame(width: 5, height: 5)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 4)
        .background(TerminalTheme.bg.opacity(0.5))
        .cornerRadius(4)
    }

    private static func formatContext(_ n: Int) -> String {
        if n >= 1_000_000 { return "\(n / 1_000_000)M ctx" }
        if n >= 1_000     { return "\(n / 1_000)k ctx" }
        return "\(n) ctx"
    }
}

// MARK: - Shared UI Helpers

enum LLMTabHelpers {

    // MARK: Loading

    static var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .controlSize(.small)
                .tint(TerminalTheme.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Empty state

    static func emptyView(icon: String, message: String, hint: String) -> some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.3))
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
            Text(hint)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.4))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Error state

    static func errorView(_ message: String, retry: @escaping () -> Void) -> some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.yellow)
            Text(message)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .multilineTextAlignment(.center)
            Button("Retry", action: retry)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent)
                .pointerCursor()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Refresh button

    static func refreshButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10))
                Text("refresh")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
            }
            .foregroundColor(TerminalTheme.accent)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(TerminalTheme.accent.opacity(0.1))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.accent.opacity(0.2), lineWidth: 1))
            .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: Count badge

    static func countBadge(_ count: Int) -> some View {
        Text("\(count)")
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .foregroundColor(TerminalTheme.accent)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(TerminalTheme.accent.opacity(0.1))
            .cornerRadius(3)
    }

    // MARK: Capability badge

    static func capBadge(_ cap: String, color: Color = TerminalTheme.textDim) -> some View {
        Text(cap)
            .font(.system(size: 8, design: .monospaced))
            .foregroundColor(color)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(TerminalTheme.surfaceBg)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
            .cornerRadius(3)
    }

    // MARK: Tier badge

    static func tierBadge(_ tier: String) -> some View {
        let color: Color = {
            switch tier {
            case "frontier": return TerminalTheme.yellow
            case "cloud":    return TerminalTheme.accent
            case "local":    return TerminalTheme.green
            case "direct":   return Color(red: 0.55, green: 0.65, blue: 0.90)
            default:         return TerminalTheme.gray
            }
        }()
        return Text(tier)
            .font(.system(size: 9, weight: .semibold, design: .monospaced))
            .foregroundColor(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.1))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(color.opacity(0.3), lineWidth: 1))
            .cornerRadius(4)
    }

    // MARK: KV row helpers (used by IdentityTab)

    static func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .foregroundColor(TerminalTheme.textDim.opacity(0.6))
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 4)
    }

    static var kvDivider: some View {
        Rectangle()
            .fill(TerminalTheme.border)
            .frame(height: 1)
            .padding(.horizontal, 12)
    }

    static func kv(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .textSelection(.enabled)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    static func kvTagged(_ label: String, _ value: String, tagColor: Color) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(tagColor)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(tagColor.opacity(0.1))
                .overlay(RoundedRectangle(cornerRadius: 3).stroke(tagColor.opacity(0.3), lineWidth: 1))
                .cornerRadius(3)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }
}
