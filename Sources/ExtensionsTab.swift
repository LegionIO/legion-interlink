import SwiftUI

// MARK: - Extension Catalog Definitions

enum ExtensionCategory: String, CaseIterable {
    case extensions = "Extensions"
    case skills = "Extension Skills"
    case packs = "Setup Packs"
}

struct CatalogExtension: Identifiable {
    let id: String
    let name: String
    let category: ExtensionCategory

    var gemName: String { name }
}

struct SetupPack: Identifiable {
    let id: String
    let command: String
    let description: String
}

private let catalogExtensions: [CatalogExtension] = [
    CatalogExtension(id: "lex-exec", name: "lex-exec", category: .extensions),
    CatalogExtension(id: "lex-knowledge", name: "lex-knowledge", category: .extensions),
    CatalogExtension(id: "lex-apollo", name: "lex-apollo", category: .extensions),
    CatalogExtension(id: "lex-microsoft_teams", name: "lex-microsoft_teams", category: .extensions),
    CatalogExtension(id: "lex-identity-system", name: "lex-identity-system", category: .extensions),
    CatalogExtension(id: "lex-identity-github", name: "lex-identity-github", category: .extensions),
    CatalogExtension(id: "lex-developer", name: "lex-developer", category: .extensions),
    CatalogExtension(id: "lex-service_now", name: "lex-service_now", category: .extensions),
    CatalogExtension(id: "lex-github", name: "lex-github", category: .extensions),
    CatalogExtension(id: "lex-assessor", name: "lex-assessor", category: .extensions),
    CatalogExtension(id: "lex-planner", name: "lex-planner", category: .extensions),
    CatalogExtension(id: "lex-validator", name: "lex-validator", category: .extensions),
    CatalogExtension(id: "lex-ssh", name: "lex-ssh", category: .extensions),
    CatalogExtension(id: "lex-slack", name: "lex-slack", category: .extensions),
    CatalogExtension(id: "lex-jfrog", name: "lex-jfrog", category: .extensions),
    CatalogExtension(id: "lex-dns", name: "lex-dns", category: .extensions),
    CatalogExtension(id: "lex-cloudflare", name: "lex-cloudflare", category: .extensions),
    CatalogExtension(id: "lex-ping", name: "lex-ping", category: .extensions),
    CatalogExtension(id: "lex-http", name: "lex-http", category: .extensions),
    CatalogExtension(id: "lex-prompt", name: "lex-prompt", category: .extensions),
    CatalogExtension(id: "lex-skill-superpowers", name: "lex-skill-superpowers", category: .skills),
]

private let setupPacks: [SetupPack] = [
    SetupPack(id: "agentic", command: "agentic", description: "Full cognitive stack (GAIA + LLM + Apollo + all agentic extensions)"),
    SetupPack(id: "channels", command: "channels", description: "Channel adapters (Slack, Teams)"),
    SetupPack(id: "claude-code", command: "claude-code", description: "Legion MCP server and slash command skill for Claude Code"),
    SetupPack(id: "cursor", command: "cursor", description: "Legion MCP server config for Cursor"),
    SetupPack(id: "fleet", command: "fleet", description: "Fleet Pipeline (two-phase: install gems + seed relationships)"),
    SetupPack(id: "gaia", command: "gaia", description: "Cognitive coordination engine and agentic extensions (GAIA stack)"),
    SetupPack(id: "identity", command: "identity", description: "Identity and access management (RBAC + identity providers)"),
    SetupPack(id: "llm", command: "llm", description: "LLM routing and provider integration"),
    SetupPack(id: "python", command: "python", description: "Legion Python environment (venv + document/data packages)"),
    SetupPack(id: "vscode", command: "vscode", description: "Legion MCP server config for VS Code"),
]

// MARK: - Extensions Tab

struct ExtensionsTab: View {
    @StateObject private var cache = DaemonCache.shared
    @State private var searchText = ""
    @State private var selectedCategory: ExtensionCategory = .extensions
    @State private var installingItems: Set<String> = []
    @State private var installedItems: Set<String> = []
    @State private var installOutput: [String: String] = [:]

    private var loadedExtensionNames: Set<String> {
        Set(cache.extensions.map(\.name))
    }

    private var filteredCatalog: [CatalogExtension] {
        let items = catalogExtensions.filter { $0.category == selectedCategory }
        if searchText.isEmpty { return items }
        let q = searchText.lowercased()
        return items.filter { $0.name.lowercased().contains(q) }
    }

    private var filteredPacks: [SetupPack] {
        if searchText.isEmpty { return setupPacks }
        let q = searchText.lowercased()
        return setupPacks.filter {
            $0.command.lowercased().contains(q) || $0.description.lowercased().contains(q)
        }
    }

    private var filteredLoaded: [CachedExtension] {
        if searchText.isEmpty { return cache.extensions }
        let q = searchText.lowercased()
        return cache.extensions.filter {
            $0.name.lowercased().contains(q) || $0.namespace.lowercased().contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            categoryBar

            if selectedCategory == .packs {
                packsContent
            } else {
                extensionCatalogContent
            }
        }
        .background(TerminalTheme.bg)
        .task { await cache.loadExtensions() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "puzzlepiece.extension")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("EXTENSIONS")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if !cache.extensions.isEmpty {
                Text("\(cache.extensions.count) loaded")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.green)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(TerminalTheme.green.opacity(0.1))
                    .cornerRadius(3)
            }

            Spacer()

            TerminalSearchBox(text: $searchText)

            Button(action: { Task { await cache.loadExtensions(force: true) } }) {
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
                .overlay(
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(TerminalTheme.accent.opacity(0.2), lineWidth: 1)
                )
                .cornerRadius(3)
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Category Bar

    private var categoryBar: some View {
        HStack(spacing: 0) {
            ForEach(ExtensionCategory.allCases, id: \.rawValue) { cat in
                categoryButton(cat)
            }
            Spacer()
        }
        .padding(.horizontal, 8)
        .background(TerminalTheme.bg)
        .overlay(
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func categoryButton(_ category: ExtensionCategory) -> some View {
        let isSelected = selectedCategory == category
        return Button(action: { withAnimation(.easeInOut(duration: 0.15)) { selectedCategory = category } }) {
            Text(category.rawValue)
                .font(.system(size: 10, weight: isSelected ? .semibold : .regular, design: .monospaced))
                .foregroundColor(isSelected ? TerminalTheme.accent : TerminalTheme.textDim)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(isSelected ? TerminalTheme.surfaceBg : Color.clear)
                .overlay(
                    Rectangle()
                        .fill(isSelected ? TerminalTheme.accent : Color.clear)
                        .frame(height: 2),
                    alignment: .bottom
                )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Extension Catalog Content

    private var extensionCatalogContent: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                // Loaded from daemon (live)
                if !filteredLoaded.isEmpty {
                    sectionHeader("RUNNING", icon: "bolt.circle", color: TerminalTheme.green)
                    ForEach(filteredLoaded) { ext in
                        loadedExtensionCard(ext)
                    }
                }

                // Available to install
                let available = filteredCatalog
                if !available.isEmpty {
                    sectionHeader("AVAILABLE", icon: "arrow.down.circle", color: TerminalTheme.accent)
                    ForEach(available) { ext in
                        catalogCard(ext)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    // MARK: - Packs Content

    private var packsContent: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                sectionHeader("SETUP PACKS", icon: "shippingbox", color: TerminalTheme.accent)
                Text("legionio setup <pack>")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .leading)

                ForEach(filteredPacks) { pack in
                    packCard(pack)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String, icon: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundColor(color.opacity(0.7))
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(color.opacity(0.7))
            Spacer()
        }
        .padding(.top, 8)
        .padding(.bottom, 2)
    }

    // MARK: - Loaded Extension Card

    private func loadedExtensionCard(_ ext: CachedExtension) -> some View {
        let color = ext.isReady ? TerminalTheme.green : TerminalTheme.gray
        return HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(color)
                        .frame(width: 7, height: 7)
                        .shadow(color: color.opacity(0.5), radius: 3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(ext.name)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(TerminalTheme.text)

                        HStack(spacing: 8) {
                            Text(ext.namespace)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim)

                            Text("v\(ext.version)")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(TerminalTheme.accent.opacity(0.7))
                        }
                    }

                    Spacer()

                    Text(ext.displayState)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(color)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(color.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(color.opacity(0.3), lineWidth: 1)
                        )
                        .cornerRadius(4)
                }
                .padding(10)

                if !ext.runners.isEmpty {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 10)

                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(ext.runners, id: \.name) { runner in
                            HStack(spacing: 6) {
                                Image(systemName: "play.circle")
                                    .font(.system(size: 8))
                                    .foregroundColor(TerminalTheme.accent.opacity(0.6))
                                Text(runner.name)
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(TerminalTheme.textDim)
                                Text("\(runner.methodCount) methods")
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(TerminalTheme.textDim.opacity(0.6))
                            }
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
            }
        }
    }

    // MARK: - Catalog Card

    private func catalogCard(_ ext: CatalogExtension) -> some View {
        let isLoaded = loadedExtensionNames.contains(ext.name)
        let isInstalling = installingItems.contains(ext.id)
        let justInstalled = installedItems.contains(ext.id)

        return HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(isLoaded ? TerminalTheme.green : justInstalled ? TerminalTheme.yellow : TerminalTheme.gray)
                        .frame(width: 7, height: 7)

                    Text(ext.name)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    Spacer()

                    if isLoaded {
                        Text("loaded")
                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                            .foregroundColor(TerminalTheme.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(TerminalTheme.green.opacity(0.1))
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(TerminalTheme.green.opacity(0.3), lineWidth: 1))
                            .cornerRadius(4)
                    } else if isInstalling {
                        ProgressView()
                            .controlSize(.mini)
                            .scaleEffect(0.7)
                    } else if justInstalled {
                        Text("installed — restart daemon")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(TerminalTheme.yellow)
                    } else {
                        Button(action: { installExtension(ext) }) {
                            Text("install")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundColor(TerminalTheme.accent)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 5)
                                .background(TerminalTheme.accent.opacity(0.1))
                                .overlay(RoundedRectangle(cornerRadius: 4).stroke(TerminalTheme.accent.opacity(0.3), lineWidth: 1))
                                .cornerRadius(4)
                        }
                        .buttonStyle(.plain)
                        .pointerCursor()
                    }
                }
                .padding(10)

                if let output = installOutput[ext.id] {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 10)

                    Text(output)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                        .lineLimit(3)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                }
            }
        }
    }

    // MARK: - Pack Card

    private func packCard(_ pack: SetupPack) -> some View {
        let isInstalling = installingItems.contains(pack.id)
        let justInstalled = installedItems.contains(pack.id)

        return HoverCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 11))
                        .foregroundColor(TerminalTheme.accent.opacity(0.6))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(pack.command)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(TerminalTheme.text)
                        Text(pack.description)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(TerminalTheme.textDim)
                            .lineLimit(2)
                    }

                    Spacer()

                    if isInstalling {
                        ProgressView()
                            .controlSize(.mini)
                            .scaleEffect(0.7)
                    } else if justInstalled {
                        Text("done")
                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                            .foregroundColor(TerminalTheme.green)
                    } else {
                        Button(action: { installPack(pack) }) {
                            Text("install")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundColor(TerminalTheme.accent)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 5)
                                .background(TerminalTheme.accent.opacity(0.1))
                                .overlay(RoundedRectangle(cornerRadius: 4).stroke(TerminalTheme.accent.opacity(0.3), lineWidth: 1))
                                .cornerRadius(4)
                        }
                        .buttonStyle(.plain)
                        .pointerCursor()
                    }
                }
                .padding(10)

                if let output = installOutput[pack.id] {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 10)

                    Text(output)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                        .lineLimit(4)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                }
            }
        }
    }

    // MARK: - Install Actions

    private func installExtension(_ ext: CatalogExtension) {
        installingItems.insert(ext.id)
        let legionGem = Self.resolvedLegionGemPath

        Task.detached {
            let (output, success) = await Self.runInstall(legionGem, arguments: ["install", ext.gemName])
            await MainActor.run {
                installingItems.remove(ext.id)
                if success {
                    installedItems.insert(ext.id)
                }
                installOutput[ext.id] = output
            }
        }
    }

    private func installPack(_ pack: SetupPack) {
        installingItems.insert(pack.id)
        let legionioPath = Self.resolvedLegionioPath

        Task.detached {
            let (output, success) = await Self.runInstall(legionioPath, arguments: ["setup", pack.command])
            await MainActor.run {
                installingItems.remove(pack.id)
                if success {
                    installedItems.insert(pack.id)
                }
                installOutput[pack.id] = output
            }
        }
    }

    // MARK: - Process Helpers

    private static let resolvedLegionGemPath: String = {
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/legion-gem") {
            return "/opt/homebrew/bin/legion-gem"
        }
        return "/usr/local/bin/legion-gem"
    }()

    private static let resolvedLegionioPath: String = {
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/legionio") {
            return "/opt/homebrew/bin/legionio"
        }
        return "/usr/local/bin/legionio"
    }()

    private nonisolated static func runInstall(_ executable: String, arguments: [String]) async -> (output: String, success: Bool) {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            let lastLines = output.components(separatedBy: "\n").suffix(3).joined(separator: "\n")
            return (lastLines, process.terminationStatus == 0)
        } catch {
            return (error.localizedDescription, false)
        }
    }
}
