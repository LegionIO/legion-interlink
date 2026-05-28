import SwiftUI
import AppKit

// MARK: - Clients Tab

struct ClientsTab: View {
    @EnvironmentObject var manager: ServiceManager

    // Per-client routing toggle — persisted to ~/.legionio/settings/interlink.json
    @State private var claudeRoutingEnabled: Bool = false
    @State private var codexRoutingEnabled: Bool = false
    @State private var kaiRoutingEnabled: Bool = false

    // Install state only — no running state tracked
    @State private var claudeInstalled: Bool = false
    @State private var codexInstalled: Bool = false
    @State private var kaiInstalled: Bool = false

    private var daemonOnline: Bool { manager.overallStatus == .online }
    private var claudeRouted: Bool { daemonOnline && claudeRoutingEnabled }
    private var codexRouted: Bool { daemonOnline && codexRoutingEnabled }
    private var kaiRouted: Bool { daemonOnline && kaiRoutingEnabled }

    var body: some View {
        VStack(spacing: 0) {
            clientsHeader

            ScrollView {
                VStack(spacing: 12) {
                    claudeCodeCard
                    codexCard
                    kaiClientCard
                }
                .padding(16)
            }
        }
        .background(TerminalTheme.bg)
        .task { detectClients(); loadRoutingState() }
        .onChange(of: claudeRoutingEnabled) { enabled in
            saveRoutingState()
            Task.detached {
                if enabled { ClientConfigManager.applyClaudeConfig() }
                else { ClientConfigManager.restoreClaudeConfig() }
            }
        }
        .onChange(of: codexRoutingEnabled) { enabled in
            saveRoutingState()
            Task.detached {
                if enabled { ClientConfigManager.applyCodexConfig() }
                else { ClientConfigManager.restoreCodexConfig() }
            }
        }
        .onChange(of: kaiRoutingEnabled) { enabled in
            saveRoutingState()
            Task.detached {
                if enabled { ClientConfigManager.applyKaiConfig() }
                else { ClientConfigManager.restoreKaiConfig() }
            }
        }
    }

    // MARK: - Detection

    private func detectClients() {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path

        claudeInstalled =
            fm.isExecutableFile(atPath: "/opt/homebrew/bin/claude") ||
            fm.isExecutableFile(atPath: "/usr/local/bin/claude") ||
            fm.isExecutableFile(atPath: "\(home)/.local/bin/claude")

        codexInstalled =
            fm.fileExists(atPath: "/Applications/Codex.app") ||
            fm.fileExists(atPath: "\(home)/Applications/Codex.app")

        kaiInstalled =
            fm.fileExists(atPath: "/Applications/Kai.app") ||
            fm.fileExists(atPath: "\(home)/Applications/Kai.app")
    }

    // MARK: - Header

    private var clientsHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.2.circle")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("CLIENTS")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            Spacer()

            let anyRouted = claudeRouted || codexRouted || kaiRouted
            HStack(spacing: 5) {
                Circle()
                    .fill(anyRouted ? TerminalTheme.green : TerminalTheme.gray)
                    .frame(width: 5, height: 5)
                Text(anyRouted ? "routing: active" : "routing: inactive")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundColor(anyRouted ? TerminalTheme.green : TerminalTheme.textDim)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background((anyRouted ? TerminalTheme.green : TerminalTheme.gray).opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke((anyRouted ? TerminalTheme.green : TerminalTheme.gray).opacity(0.2), lineWidth: 1)
            )
            .cornerRadius(3)
        }
        .padding(.horizontal, 16)
        .frame(height: 36)
        .background(TerminalTheme.surfaceBg)
        .overlay(
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Claude Code Card

    private var claudeCodeCard: some View {
        HoverCard {
            HStack(spacing: 12) {
                PulsingDot(
                    color: claudeInstalled ? TerminalTheme.green : TerminalTheme.gray,
                    isTransitioning: false
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Claude Code")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    Text(claudeInstalled
                         ? (claudeRouted ? "routed via LegionIO" : "installed")
                         : "not installed")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(claudeRouted ? TerminalTheme.green : TerminalTheme.textDim)
                }

                Spacer()

                if claudeInstalled {
                    routingToggle(enabled: $claudeRoutingEnabled, active: claudeRouted)
                    TerminalActionButton(label: "open", color: TerminalTheme.green) {
                        openTerminalWithCommand("claude")
                    }
                } else {
                    installHintText("npm i -g @anthropic-ai/claude-code")
                }
            }
            .padding(12)
        }
    }

    // MARK: - Codex Card

    private var codexCard: some View {
        HoverCard {
            HStack(spacing: 12) {
                PulsingDot(
                    color: codexInstalled ? TerminalTheme.green : TerminalTheme.gray,
                    isTransitioning: false
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Codex")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    Text(codexInstalled
                         ? (codexRouted ? "routed via LegionIO" : "installed")
                         : "not installed")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(codexRouted ? TerminalTheme.green : TerminalTheme.textDim)
                }

                Spacer()

                if codexInstalled {
                    routingToggle(enabled: $codexRoutingEnabled, active: codexRouted)
                    TerminalActionButton(label: "open", color: TerminalTheme.green) {
                        NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/Codex.app"))
                    }
                } else {
                    TerminalActionButton(label: "install", color: TerminalTheme.accent) {
                        installCodex()
                    }
                }
            }
            .padding(12)
        }
    }

    // MARK: - Kai Card

    private var kaiClientCard: some View {
        HoverCard {
            HStack(spacing: 12) {
                PulsingDot(
                    color: kaiInstalled ? TerminalTheme.green : TerminalTheme.gray,
                    isTransitioning: false
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Kai")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    Text(kaiInstalled
                         ? (kaiRouted ? "routed via LegionIO" : "installed")
                         : "not installed")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(kaiRouted ? TerminalTheme.green : TerminalTheme.textDim)
                }

                Spacer()

                if kaiInstalled {
                    routingToggle(enabled: $kaiRoutingEnabled, active: kaiRouted)
                    TerminalActionButton(label: "open", color: TerminalTheme.green) {
                        NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/Kai.app"))
                    }
                } else {
                    TerminalActionButton(label: "install", color: TerminalTheme.accent) {
                        installKai()
                    }
                }
            }
            .padding(12)
        }
    }

    // MARK: - Routing Toggle (segmented pill)

    private func routingToggle(enabled: Binding<Bool>, active: Bool) -> some View {
        HStack(spacing: 0) {
            Button(action: { if !enabled.wrappedValue { enabled.wrappedValue = true } }) {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 9, weight: .semibold))
                    Text("LegionIO")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                }
                .foregroundColor(active ? TerminalTheme.bg : TerminalTheme.textDim)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(active ? TerminalTheme.accent : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerCursor()

            Rectangle()
                .fill(TerminalTheme.border)
                .frame(width: 1, height: 20)

            Button(action: { if enabled.wrappedValue { enabled.wrappedValue = false } }) {
                HStack(spacing: 4) {
                    Image(systemName: "circle.dotted")
                        .font(.system(size: 9, weight: .semibold))
                    Text("native")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                }
                .foregroundColor(!active ? TerminalTheme.text : TerminalTheme.textDim)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(!active ? TerminalTheme.surfaceBg : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(active ? TerminalTheme.accent.opacity(0.4) : TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(5)
        .disabled(!daemonOnline)
        .opacity(daemonOnline ? 1 : 0.4)
        .help(daemonOnline
              ? (active ? "Click 'native' to stop routing via LegionIO" : "Click 'LegionIO' to route through the daemon")
              : "Start the LegionIO daemon to enable routing")
    }

    // MARK: - Routing State Persistence (~/.legionio/settings/interlink.json)

    private func loadRoutingState() {
        guard let json = SettingsFile.read("interlink") else { return }
        if let claude = json["clientRouting.claude"] as? Bool { claudeRoutingEnabled = claude }
        if let codex  = json["clientRouting.codex"]  as? Bool { codexRoutingEnabled  = codex  }
        if let kai    = json["clientRouting.kai"]    as? Bool { kaiRoutingEnabled    = kai    }
    }

    private func saveRoutingState() {
        var json = SettingsFile.read("interlink") ?? [:]
        json["clientRouting.claude"] = claudeRoutingEnabled
        json["clientRouting.codex"]  = codexRoutingEnabled
        json["clientRouting.kai"]    = kaiRoutingEnabled
        _ = SettingsFile.write("interlink", content: json)
    }

    // MARK: - Helpers

    /// Opens a new Terminal.app window and immediately runs the given command.
    private func openTerminalWithCommand(_ command: String) {
        let script = """
        tell application "Terminal"
            activate
            do script "\(command)"
        end tell
        """
        if let appleScript = NSAppleScript(source: script) {
            var error: NSDictionary?
            appleScript.executeAndReturnError(&error)
        }
    }

    private func installHintText(_ hint: String) -> some View {
        Text(hint)
            .font(.system(size: 9, design: .monospaced))
            .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            .lineLimit(1)
            .truncationMode(.tail)
    }

    // MARK: - Install Helpers

    private func installKai() {
        let brew = ServiceManager.shared.resolvedBrewPathPublic
        Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: brew)
            process.arguments = ["install", "--cask", "legionio/tap/kai"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            process.waitUntilExit()
            let success = process.terminationStatus == 0
            await MainActor.run { if success { kaiInstalled = true } }
        }
    }

    private func installCodex() {
        let brew = ServiceManager.shared.resolvedBrewPathPublic
        Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: brew)
            process.arguments = ["install", "--cask", "codex"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            process.waitUntilExit()
            let success = process.terminationStatus == 0
            await MainActor.run { if success { codexInstalled = true } }
        }
    }
}
