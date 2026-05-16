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

// MARK: - Combined LLM Tab (Providers + Models)

struct LLMTab: View {
    @StateObject private var cache = DaemonCache.shared
    @State private var section = LLMSection.providers
    @State private var searchText = ""

    enum LLMSection: String, CaseIterable {
        case providers = "Providers"
        case models    = "Models"
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            Group {
                switch section {
                case .providers: providersBody
                case .models:    modelsBody
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.12), value: section)
        }
        .background(TerminalTheme.bg)
        .task {
            await cache.loadLLMProviders()
            await cache.loadLLMModels()
        }
    }

    // MARK: - Shared header with section picker

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("LLM")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            // Section picker
            HStack(spacing: 0) {
                ForEach(LLMSection.allCases, id: \.self) { s in
                    sectionChip(s)
                }
            }
            .background(TerminalTheme.cardBg)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(TerminalTheme.border, lineWidth: 1))
            .cornerRadius(4)

            // Count badge for active section
            let count = section == .providers ? cache.llmProviders.count : cache.llmModels.count
            if count > 0 {
                LLMTabHelpers.countBadge(count)
            }

            Spacer()

            TerminalSearchBox(text: $searchText)

            if section == .providers {
                LLMTabHelpers.refreshButton { Task { await cache.loadLLMProviders(force: true) } }
            } else {
                LLMTabHelpers.refreshButton { Task { await cache.loadLLMModels(force: true) } }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(Rectangle().fill(TerminalTheme.border).frame(height: 1), alignment: .bottom)
    }

    private func sectionChip(_ s: LLMSection) -> some View {
        let active = section == s
        return Button(action: { withAnimation(.easeInOut(duration: 0.12)) { section = s } }) {
            Text(s.rawValue)
                .font(.system(size: 10, weight: active ? .semibold : .regular, design: .monospaced))
                .foregroundColor(active ? TerminalTheme.bg : TerminalTheme.textDim)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(active ? TerminalTheme.accent : Color.clear)
                .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Providers section

    private var providersBody: some View {
        Group {
            if cache.llmProvidersLoading && !cache.llmProvidersLoaded {
                LLMTabHelpers.loadingView
            } else if let error = cache.llmProvidersError {
                LLMTabHelpers.errorView(error) { Task { await cache.loadLLMProviders(force: true) } }
            } else if filteredProviders.isEmpty {
                LLMTabHelpers.emptyView(icon: "cloud.fill",
                                        message: "No providers found",
                                        hint: "LLM providers will appear when the daemon is running")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filteredProviders) { provider in
                            providerCard(provider)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
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

    private func providerCard(_ provider: CachedLLMProvider) -> some View {
        HoverCard {
            HStack(spacing: 10) {
                let stateOk = provider.circuitState == "closed"
                Circle()
                    .fill(stateOk ? TerminalTheme.green : TerminalTheme.red)
                    .frame(width: 7, height: 7)
                    .shadow(color: (stateOk ? TerminalTheme.green : TerminalTheme.red).opacity(0.5), radius: 3)

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
                        .foregroundColor(stateOk ? TerminalTheme.green : TerminalTheme.red)
                }
            }
            .padding(12)
        }
    }

    // MARK: - Models section

    private var filteredModels: [CachedLLMModel] {
        guard !searchText.isEmpty else { return cache.llmModels }
        let q = searchText.lowercased()
        return cache.llmModels.filter {
            $0.id.lowercased().contains(q) ||
            $0.providers.joined(separator: " ").lowercased().contains(q) ||
            $0.modelFamilies.joined(separator: " ").lowercased().contains(q)
        }
    }

    private var modelsBody: some View {
        Group {
            if cache.llmModelsLoading && !cache.llmModelsLoaded {
                LLMTabHelpers.loadingView
            } else if let error = cache.llmModelsError {
                LLMTabHelpers.errorView(error) { Task { await cache.loadLLMModels(force: true) } }
            } else if filteredModels.isEmpty {
                LLMTabHelpers.emptyView(icon: "cpu",
                                        message: "No models found",
                                        hint: "LLM models will appear when the daemon is running")
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(filteredModels) { model in
                            modelCard(model)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private func modelCard(_ model: CachedLLMModel) -> some View {
        HoverCard {
            HStack(spacing: 10) {
                // Type badge(s)
                VStack(spacing: 2) {
                    ForEach(model.types, id: \.self) { t in
                        let isInfer = t == "inference"
                        Text(isInfer ? "INF" : "EMB")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundColor(isInfer ? TerminalTheme.accent : TerminalTheme.yellow)
                            .frame(width: 28)
                            .padding(.vertical, 2)
                            .background(isInfer
                                ? TerminalTheme.accent.opacity(0.12)
                                : TerminalTheme.yellow.opacity(0.12))
                            .cornerRadius(2)
                    }
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(model.id)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)
                        .lineLimit(1)

                    HStack(spacing: 5) {
                        ForEach(model.providers, id: \.self) { p in
                            let pColor = providerColor(p)
                            Text(p)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(pColor)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(pColor.opacity(0.1))
                                .cornerRadius(3)
                        }

                        if let ctx = model.maxContext {
                            Text(formatContext(ctx))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim)
                        }
                    }
                }

                Spacer()

                if !model.capabilities.isEmpty {
                    HStack(spacing: 3) {
                        ForEach(model.capabilities.prefix(3), id: \.self) { cap in
                            LLMTabHelpers.capBadge(cap)
                        }
                    }
                }

                Circle()
                    .fill(model.enabled ? TerminalTheme.green : TerminalTheme.red)
                    .frame(width: 6, height: 6)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private func providerColor(_ provider: String) -> Color {
        switch provider {
        case "anthropic": return Color(red: 0.85, green: 0.60, blue: 0.35)
        case "bedrock":   return Color(red: 0.90, green: 0.55, blue: 0.20)
        case "ollama":    return Color(red: 0.50, green: 0.75, blue: 0.55)
        case "vllm":      return Color(red: 0.55, green: 0.65, blue: 0.90)
        case "openai":    return Color(red: 0.30, green: 0.80, blue: 0.60)
        case "gemini":    return Color(red: 0.65, green: 0.45, blue: 0.90)
        default:          return TerminalTheme.textDim
        }
    }

    private func formatContext(_ n: Int) -> String {
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
