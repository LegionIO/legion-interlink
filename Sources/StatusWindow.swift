import SwiftUI
import AppKit

// MARK: - Dark Terminal Theme

enum TerminalTheme {
    static let bg = Color(red: 0.08, green: 0.08, blue: 0.10)
    static let surfaceBg = Color(red: 0.11, green: 0.11, blue: 0.14)
    static let cardBg = Color(red: 0.14, green: 0.14, blue: 0.17)
    static let border = Color.white.opacity(0.08)
    static let text = Color(red: 0.88, green: 0.88, blue: 0.90)
    static let textDim = Color(red: 0.55, green: 0.55, blue: 0.58)
    static let accent = Color(red: 0.56, green: 0.50, blue: 0.92)
    static let cyan = Color(red: 0.25, green: 0.82, blue: 0.88)
    static let green = Color(red: 0.30, green: 0.85, blue: 0.45)
    static let red = Color(red: 0.95, green: 0.35, blue: 0.35)
    static let yellow = Color(red: 0.95, green: 0.80, blue: 0.25)
    static let gray = Color(red: 0.45, green: 0.45, blue: 0.48)
}

// MARK: - Hover Card

/// A card container that subtly lifts and brightens its border on hover.
struct HoverCard<Content: View>: View {
    @State private var isHovered = false
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .background(isHovered ? TerminalTheme.cardBg.opacity(1.15) : TerminalTheme.cardBg)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(
                        isHovered ? TerminalTheme.accent.opacity(0.2) : TerminalTheme.border,
                        lineWidth: 1
                    )
            )
            .cornerRadius(6)
            .shadow(
                color: isHovered ? TerminalTheme.accent.opacity(0.06) : Color.clear,
                radius: 8, y: 2
            )
            .animation(.easeOut(duration: 0.15), value: isHovered)
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

// MARK: - Breathing Status Pill

/// A status pill with a subtle breathing glow animation when online.
/// Animation pauses when the window loses focus to avoid GPU compositing overhead.
private struct BreathingStatusPill: View {
    let color: Color
    let text: String
    let isOnline: Bool
    @Environment(\.controlActiveState) private var controlActiveState
    @State private var breathe = false

    private var shouldAnimate: Bool {
        isOnline && controlActiveState == .key
    }

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
                .shadow(color: color.opacity(breathe ? 0.8 : 0.3), radius: breathe ? 5 : 2)

            Text(text.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(color.opacity(breathe ? 0.12 : 0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(color.opacity(0.3), lineWidth: 1)
        )
        .cornerRadius(4)
        .animation(shouldAnimate ? .easeInOut(duration: 2.0).repeatForever(autoreverses: true) : .default, value: breathe)
        .onAppear {
            if shouldAnimate { breathe = true }
        }
        .onChange(of: shouldAnimate) { animate in
            breathe = animate
        }
    }
}

// MARK: - Pulsing Status Text

private struct PulsingStatusText: View {
    let status: ServiceStatus
    @Environment(\.controlActiveState) private var controlActiveState
    @State private var pulse = false
    @State private var elapsedSeconds = 0
    @State private var elapsedTimer: Timer?

    private var isTransitioning: Bool {
        status == .starting || status == .stopping
    }

    private var shouldAnimate: Bool {
        isTransitioning && controlActiveState == .key
    }

    private var color: Color {
        switch status {
        case .running:  return TerminalTheme.green
        case .stopped:  return TerminalTheme.red
        case .starting: return TerminalTheme.yellow
        case .stopping: return TerminalTheme.yellow
        case .unknown:  return TerminalTheme.gray
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(status.rawValue.lowercased())
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(color)
                .opacity(isTransitioning && pulse ? 0.3 : 1.0)

            if isTransitioning {
                Text("\(elapsedSeconds)s")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(color.opacity(0.6))
            }
        }
        .animation(shouldAnimate ? .easeInOut(duration: 0.6).repeatForever(autoreverses: true) : .default, value: pulse)
        .onAppear {
            if shouldAnimate {
                startTimer()
                pulse = true
            }
        }
        .onDisappear {
            stopTimer()
        }
        .onChange(of: shouldAnimate) { animate in
            if animate {
                startTimer()
                pulse = true
            } else if !isTransitioning {
                stopTimer()
                elapsedSeconds = 0
                pulse = false
            }
        }
        .onChange(of: status) { newStatus in
            let transitioning = newStatus == .starting || newStatus == .stopping
            if transitioning {
                elapsedSeconds = 0
                startTimer()
                pulse = true
            } else {
                stopTimer()
                elapsedSeconds = 0
                pulse = false
            }
        }
    }

    private func startTimer() {
        stopTimer()
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            elapsedSeconds += 1
        }
    }

    private func stopTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }
}

// MARK: - Pulsing Status Dot

struct PulsingDot: View {
    let color: Color
    let isTransitioning: Bool
    @Environment(\.controlActiveState) private var controlActiveState
    @State private var pulse = false

    private var shouldPulse: Bool {
        isTransitioning && controlActiveState == .key
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.2))
                .frame(width: 20, height: 20)
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
                .shadow(color: color.opacity(pulse ? 0.9 : 0.5), radius: pulse ? 8 : 4)
        }
        .opacity(isTransitioning && pulse ? 0.5 : 1.0)
        .animation(shouldPulse ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true) : .default, value: pulse)
        .onAppear {
            if shouldPulse { pulse = true }
        }
        .onChange(of: shouldPulse) { active in
            pulse = active
        }
    }
}

// MARK: - Status Window View

struct StatusWindowView: View {
    @EnvironmentObject var manager: ServiceManager
    @State private var selectedTab = 0
    @State private var hasAppeared = false

    /// Fallback version string read from the VERSION file at compile time.
    /// The .app bundle will override this via CFBundleShortVersionString.
    private let appVersion: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        // Try repo-relative VERSION file first (dev builds)
        let candidates = [
            Bundle.main.bundlePath + "/Contents/Resources/VERSION",
            FileManager.default.currentDirectoryPath + "/VERSION",
        ]
        for path in candidates {
            if let v = try? String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty {
                return v
            }
        }
        return "2.2.1"
    }()

    private static let tabClients = 0
    private static let tabServices = 1
    private static let tabLogs = 2
    private static let tabIdentity = 3
    private static let tabLLM = 4
    private static let tabProviders = 5
    private static let tabGaia = 6
    private static let tabMCP = 7
    private static let tabExtensions = 8
    private static let tabWorkers = 9
    private static let tabUpdates = 10
    private static let tabSettings = 11

    var body: some View {
        VStack(spacing: 0) {
            // Title bar area
            titleBar

            // Tab bar
            tabBar

            // Tab content
            Group {
                switch selectedTab {
                case Self.tabServices:   ServicesTab()
                case Self.tabClients:    ClientsTab()
                case Self.tabLogs:       LogsTab()
                case Self.tabIdentity:   IdentityTab()
                case Self.tabLLM:        LLMSettingsTab()
                case Self.tabProviders:  LLMProvidersTab()
                case Self.tabGaia:       GaiaTab()
                case Self.tabMCP:        MCPTab()
                case Self.tabExtensions: ExtensionsTab()
                case Self.tabWorkers:    WorkersTab()
                case Self.tabUpdates:    UpdatesTab()
                case Self.tabSettings:   DaemonSettingsTab()
                default:                 ServicesTab()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
            .id(selectedTab)
            .animation(.easeInOut(duration: 0.15), value: selectedTab)
        }
        .background(TerminalTheme.bg)
        .frame(minWidth: 700, minHeight: 520)
        .preferredColorScheme(.dark)
        .onAppear {
            if !hasAppeared {
                hasAppeared = true
                selectedTab = Self.tabClients
            }
        }
    }

    // MARK: - Grid Icon (matches menu bar icon)

    private static func gridIcon(size: CGFloat, color: NSColor) -> NSImage {
        let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
            let s = rect.width
            let padding: CGFloat = s * 0.1
            let gridSize = s - padding * 2
            let step = gridSize / 2

            var points: [NSPoint] = []
            for row in 0..<3 {
                for col in 0..<3 {
                    points.append(NSPoint(
                        x: padding + CGFloat(col) * step,
                        y: padding + CGFloat(row) * step
                    ))
                }
            }

            let connections: [(Int, Int)] = [
                (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),
                (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),
                (1, 3), (1, 5), (3, 7), (5, 7),
            ]

            color.withAlphaComponent(0.45).setStroke()
            for (a, b) in connections {
                let path = NSBezierPath()
                path.move(to: points[a])
                path.line(to: points[b])
                path.lineWidth = s * 0.045
                path.stroke()
            }

            let nodeRadius = s * 0.095
            for (i, p) in points.enumerated() {
                let isCenter = (i == 4)
                let r = isCenter ? nodeRadius * 1.4 : nodeRadius
                color.setFill()
                NSBezierPath(ovalIn: NSRect(
                    x: p.x - r, y: p.y - r,
                    width: r * 2, height: r * 2
                )).fill()
            }
            return true
        }
        return image
    }

    // MARK: - Title Bar

    private var titleBar: some View {
        HStack(spacing: 10) {
            Image(nsImage: Self.gridIcon(
                size: 18,
                color: NSColor(TerminalTheme.accent)
            ))

            ZStack {
                // Glow layer behind the brand text
                (Text("Legion")
                    .foregroundColor(TerminalTheme.accent)
                + Text("IO")
                    .foregroundColor(TerminalTheme.text))
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .blur(radius: 6)
                    .opacity(0.3)

                // Crisp brand text
                (Text("Legion")
                    .foregroundColor(TerminalTheme.accent)
                + Text("IO")
                    .foregroundColor(TerminalTheme.text))
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
            }

            statusPill

            Spacer()

            Text("v\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? appVersion)")
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.6))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            ZStack {
                TerminalTheme.surfaceBg
                // Subtle gradient adding depth
                LinearGradient(
                    colors: [TerminalTheme.accent.opacity(0.03), Color.clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            }
        )
    }

    private var statusPill: some View {
        let color: Color = {
            switch manager.overallStatus {
            case .online: return TerminalTheme.green
            case .offline: return TerminalTheme.red
            case .setupNeeded: return TerminalTheme.yellow
            case .checking: return TerminalTheme.gray
            }
        }()

        return BreathingStatusPill(color: color, text: manager.overallStatus.displayText, isOnline: manager.overallStatus == .online)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                tabButton(title: "Clients",    icon: "person.2.circle",       index: Self.tabClients)
                tabButton(title: "Services",   icon: "server.rack",           index: Self.tabServices)
                tabButton(title: "Logs",       icon: "terminal",              index: Self.tabLogs)
                tabButton(title: "Identity",   icon: "person.badge.key",      index: Self.tabIdentity)
                tabButton(title: "LLM",        icon: "brain",                 index: Self.tabLLM)
                tabButton(title: "Providers",  icon: "cpu",                   index: Self.tabProviders)
                tabButton(title: "GAIA",       icon: "bubble.left.and.bubble.right", index: Self.tabGaia)
                tabButton(title: "MCP",        icon: "link.circle",           index: Self.tabMCP)
                tabButton(title: "Extensions", icon: "puzzlepiece.extension", index: Self.tabExtensions)
                tabButton(title: "Workers",    icon: "gearshape.2",           index: Self.tabWorkers)
                tabButton(title: "Updates",    icon: "arrow.triangle.2.circlepath", index: Self.tabUpdates)
                tabButton(title: "Settings",   icon: "gearshape",             index: Self.tabSettings)
            }
            .padding(.horizontal, 8)
        }
        .background(TerminalTheme.bg)
        .overlay(
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func tabButton(title: String, icon: String, index: Int) -> some View {
        let isSelected = selectedTab == index
        return Button(action: { withAnimation(.easeInOut(duration: 0.15)) { selectedTab = index } }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                Text(title)
                    .font(.system(size: 12, weight: isSelected ? .semibold : .regular, design: .monospaced))
            }
            .foregroundColor(isSelected ? TerminalTheme.accent : TerminalTheme.textDim)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
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
}

// MARK: - Services Tab

struct ServicesTab: View {
    @EnvironmentObject var manager: ServiceManager
    @State private var installationState: [ServiceName: Bool] = [:]
    @State private var installing: Set<ServiceName> = []

    private var anyTransitioning: Bool {
        manager.services.contains { $0.status == .starting || $0.status == .stopping }
    }

    private var allRunning: Bool {
        manager.services.allSatisfy { $0.status == .running }
    }

    private var allStopped: Bool {
        manager.services.allSatisfy { $0.status == .stopped || $0.status == .unknown }
    }

    var body: some View {
        VStack(spacing: 0) {
            servicesHeader

            ScrollView {
                VStack(spacing: 12) {
                    ForEach(manager.services) { service in
                        let installed = installationState[service.name] ?? true
                        if !installed {
                            notInstalledCard(service.name)
                        } else if service.name == .legionio {
                            daemonCard(service)
                        } else {
                            serviceCard(service)
                        }
                    }
                }
                .padding(16)
            }
        }
        .background(TerminalTheme.bg)
        .task { checkInstallation() }
    }

    // MARK: - Installation Detection

    private func checkInstallation() {
        let fm = FileManager.default
        let brewBin = fm.isExecutableFile(atPath: "/opt/homebrew/bin/brew") ? "/opt/homebrew/bin" : "/usr/local/bin"

        installationState[.legionio] = fm.isExecutableFile(atPath: "\(brewBin)/legionio")
        installationState[.redis] = fm.isExecutableFile(atPath: "\(brewBin)/redis-server") || fm.isExecutableFile(atPath: "/opt/homebrew/opt/redis/bin/redis-server")
        installationState[.memcached] = fm.isExecutableFile(atPath: "\(brewBin)/memcached") || fm.isExecutableFile(atPath: "/opt/homebrew/opt/memcached/bin/memcached")
        installationState[.ollama] = fm.isExecutableFile(atPath: "\(brewBin)/ollama") || fm.isExecutableFile(atPath: "/usr/local/bin/ollama")
    }

    private func installService(_ service: ServiceName) {
        installing.insert(service)
        let brew = ServiceManager.shared.resolvedBrewPathPublic
        let formula: String
        switch service {
        case .legionio:  formula = "legionio/tap/legionio"
        case .redis:     formula = "redis"
        case .memcached: formula = "memcached"
        case .ollama:    formula = "ollama"
        }

        Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: brew)
            process.arguments = ["install", formula]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            process.waitUntilExit()
            let success = process.terminationStatus == 0

            await MainActor.run {
                installing.remove(service)
                if success {
                    installationState[service] = true
                }
            }
        }
    }

    // MARK: - Header

    private var servicesHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "server.rack")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("SERVICES")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            Spacer()

            HStack(spacing: 6) {
                terminalButton("start all", color: TerminalTheme.green) {
                    manager.startAll()
                }
                .disabled(anyTransitioning || allRunning)
                .opacity(anyTransitioning || allRunning ? 0.4 : 1)

                terminalButton("stop all", color: TerminalTheme.red) {
                    manager.stopAll()
                }
                .disabled(anyTransitioning || allStopped)
                .opacity(anyTransitioning || allStopped ? 0.4 : 1)
            }
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

    // MARK: - Not Installed Card

    private func notInstalledCard(_ service: ServiceName) -> some View {
        HoverCard {
            HStack(spacing: 12) {
                PulsingDot(color: TerminalTheme.gray, isTransitioning: false)

                VStack(alignment: .leading, spacing: 2) {
                    Text(service.displayName)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    Text("not installed")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                }

                Spacer()

                if installing.contains(service) {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.7)
                    Text("installing...")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                } else {
                    terminalButton("install", color: TerminalTheme.accent) {
                        installService(service)
                    }
                }
            }
            .padding(12)
        }
    }

    // MARK: - Daemon Card (LegionIO with components)

    private func daemonCard(_ service: ServiceState) -> some View {
        HoverCard {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    statusDot(service.status)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(service.name.displayName)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundColor(TerminalTheme.text)

                        HStack(spacing: 8) {
                            statusText(service.status)

                            if let pid = service.pid {
                                Text("pid:\(String(pid))")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(TerminalTheme.textDim)
                            }
                        }
                    }

                    Spacer()

                    HStack(spacing: 6) {
                        if service.status == .stopping || service.status == .starting {
                            // No button while transitioning
                        } else if service.status == .running {
                            terminalButton("restart", color: TerminalTheme.yellow) {
                                manager.restartService(service.name)
                            }
                            terminalButton("stop", color: TerminalTheme.red) {
                                manager.stopService(service.name)
                            }
                        } else {
                            terminalButton("start", color: TerminalTheme.green) {
                                manager.startService(service.name)
                            }
                        }
                    }
                }
                .padding(12)

                if service.status == .running && !manager.daemonReadiness.components.isEmpty {
                    Rectangle()
                        .fill(TerminalTheme.border)
                        .frame(height: 1)
                        .padding(.horizontal, 12)

                    VStack(alignment: .leading, spacing: 6) {
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 120), spacing: 4)
                        ], spacing: 4) {
                            ForEach(
                                manager.daemonReadiness.components.sorted(by: { $0.key < $1.key }),
                                id: \.key
                            ) { component, ready in
                                HStack(spacing: 4) {
                                    Circle()
                                        .fill(ready ? TerminalTheme.green : TerminalTheme.yellow)
                                        .frame(width: 5, height: 5)
                                    Text(component)
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundColor(TerminalTheme.textDim)
                                    Spacer()
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
            }
        }
    }

    // MARK: - Standard Service Card

    private func serviceCard(_ service: ServiceState) -> some View {
        HoverCard {
            HStack(spacing: 12) {
                statusDot(service.status)

                VStack(alignment: .leading, spacing: 2) {
                    Text(service.name.displayName)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    HStack(spacing: 8) {
                        statusText(service.status)

                        if let pid = service.pid {
                            Text("pid:\(String(pid))")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(TerminalTheme.textDim)
                        }
                    }
                }

                Spacer()

                HStack(spacing: 6) {
                    if service.status == .stopping || service.status == .starting {
                        // No button while transitioning
                    } else if service.status == .running {
                        terminalButton("restart", color: TerminalTheme.yellow) {
                            manager.restartService(service.name)
                        }
                        terminalButton("stop", color: TerminalTheme.red) {
                            manager.stopService(service.name)
                        }
                    } else {
                        terminalButton("start", color: TerminalTheme.green) {
                            manager.startService(service.name)
                        }
                    }
                }
            }
            .padding(12)
        }
    }

    private func statusDot(_ status: ServiceStatus) -> some View {
        let color = statusColor(status)
        let isTransitioning = status == .starting || status == .stopping
        return PulsingDot(color: color, isTransitioning: isTransitioning)
    }

    private func statusColor(_ status: ServiceStatus) -> Color {
        switch status {
        case .running:  return TerminalTheme.green
        case .stopped:  return TerminalTheme.red
        case .starting: return TerminalTheme.yellow
        case .stopping: return TerminalTheme.yellow
        case .unknown:  return TerminalTheme.gray
        }
    }

    private func statusText(_ status: ServiceStatus) -> some View {
        PulsingStatusText(status: status)
    }

    private func terminalButton(_ label: String, color: Color, action: @escaping () -> Void) -> some View {
        TerminalActionButton(label: label, color: color, action: action)
    }
}

// MARK: - Terminal Action Button (with hover)

struct TerminalActionButton: View {
    let label: String
    let color: Color
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isHovered ? TerminalTheme.bg : color)
                .frame(minWidth: 40)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(isHovered ? color : color.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(color.opacity(isHovered ? 0.6 : 0.3), lineWidth: 1)
                )
                .cornerRadius(4)
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.12)) {
                isHovered = hovering
            }
        }
    }
}

// MARK: - Terminal Checkbox Style

struct TerminalCheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) {
            ZStack {
                RoundedRectangle(cornerRadius: 4)
                    .fill(configuration.isOn ? TerminalTheme.accent : TerminalTheme.cardBg)
                    .frame(width: 14, height: 14)

                RoundedRectangle(cornerRadius: 4)
                    .stroke(
                        configuration.isOn ? TerminalTheme.accent : TerminalTheme.textDim.opacity(0.3),
                        lineWidth: 1
                    )
                    .frame(width: 14, height: 14)

                if configuration.isOn {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .contentShape(Rectangle())
            .animation(.easeInOut(duration: 0.15), value: configuration.isOn)

            configuration.label
        }
        .onTapGesture {
            configuration.isOn.toggle()
        }
    }
}

// MARK: - Clear Logs Button (with hover)

private struct ClearLogsButton: View {
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: "xmark.circle")
                    .font(.system(size: 10))
                Text("clear logs")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
            }
            .foregroundColor(isHovered ? TerminalTheme.text : TerminalTheme.textDim)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(isHovered ? TerminalTheme.textDim.opacity(0.2) : TerminalTheme.textDim.opacity(0.1))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(isHovered ? TerminalTheme.textDim.opacity(0.4) : TerminalTheme.textDim.opacity(0.2), lineWidth: 1)
            )
            .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.12)) {
                isHovered = hovering
            }
        }
    }
}

// MARK: - Logs Tab

struct LogsTab: View {
    @EnvironmentObject var manager: ServiceManager
    @State private var autoScroll = true

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            HStack(spacing: 12) {
                Image(systemName: "terminal")
                    .font(.system(size: 11))
                    .foregroundColor(TerminalTheme.accent)

                Text("LOGS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)

                Text("— brew services log")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))

                Spacer()

                Text("\(manager.logLines.count) lines")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))

                Toggle(isOn: $autoScroll) {
                    Text("auto-scroll")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                }
                .toggleStyle(TerminalCheckboxStyle())

                ClearLogsButton(action: { manager.clearLogs() })
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

            // Virtualized log content
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    if manager.logLines.isEmpty {
                        Text("$ waiting for log output...")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(TerminalTheme.textDim)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                    } else {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(manager.logLines) { line in
                                Text(line.text)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(Self.colorForLogLine(line.text))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .textSelection(.enabled)
                            }
                        }
                        .padding(12)
                    }

                    Color.clear
                        .frame(height: 1)
                        .id("logEnd")
                }
                .background(TerminalTheme.bg)
                .onChange(of: manager.logLines.count) { _ in
                    if autoScroll {
                        withAnimation(.easeOut(duration: 0.1)) {
                            proxy.scrollTo("logEnd", anchor: .bottom)
                        }
                    }
                }
            }
        }
        .background(TerminalTheme.bg)
        .onAppear { manager.startFastLogPolling() }
        .onDisappear { manager.stopFastLogPolling() }
    }

    private static let logDebug = Color(red: 0.55, green: 0.80, blue: 0.95)
    private static let logInfo = Color(red: 0.35, green: 0.88, blue: 0.48).opacity(0.85)
    private static let logWarn = Color(red: 0.90, green: 0.75, blue: 0.20)
    private static let logError = Color(red: 0.95, green: 0.35, blue: 0.35)
    private static let logFatal = Color(red: 0.75, green: 0.15, blue: 0.15)

    private static func colorForLogLine(_ text: String) -> Color {
        let prefix = text.prefix(120)
        if prefix.contains("FATAL") || prefix.contains("F, [") {
            return logFatal
        }
        if prefix.contains("ERROR") || prefix.contains("E, [") {
            return logError
        }
        if prefix.contains("WARN") || prefix.contains("W, [") {
            return logWarn
        }
        if prefix.contains("DEBUG") || prefix.contains("D, [") {
            return logDebug
        }
        return logInfo
    }
}

// NOTE: Tab views (ExtensionsTab, WorkersTab, DaemonSettingsTab)
// are defined in their own dedicated files.

