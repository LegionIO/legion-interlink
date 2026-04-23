import SwiftUI
import AppKit
import ServiceManagement

@main
struct LegionInterlinkApp: App {
    @StateObject private var manager = ServiceManager.shared
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        MenuBarExtra {
            MenuContent()
                .environmentObject(manager)
        } label: {
            Image(nsImage: menuBarIcon(for: manager.overallStatus))
        }
        .menuBarExtraStyle(.menu)

        Settings {
            EmptyView()
        }
    }

    // MARK: - Menu Bar Icon

    /// Draws the Legion network grid icon (16x16) with a colored dot badge.
    private func menuBarIcon(for status: OverallStatus) -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: false) { rect in
            drawLegionIcon(in: rect)
            drawStatusBadge(in: rect, status: status)
            return true
        }
        image.isTemplate = false
        return image
    }

    private func drawLegionIcon(in rect: NSRect) {
        let s = rect.width
        let iconColor = NSColor.secondaryLabelColor

        // 3x3 grid points scaled to the icon area
        let padding: CGFloat = 2
        let gridSize = s - padding * 2
        let step = gridSize / 2

        let points: [NSPoint] = (0..<3).flatMap { row in
            (0..<3).map { col in
                NSPoint(
                    x: padding + CGFloat(col) * step,
                    y: padding + CGFloat(row) * step
                )
            }
        }

        // Connections: horizontal, vertical, and diagonal
        let connections: [(Int, Int)] = [
            (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),  // horizontal
            (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),  // vertical
            (1, 3), (1, 5), (3, 7), (5, 7),                   // diagonal
        ]

        // Draw connections
        iconColor.withAlphaComponent(0.35).setStroke()
        for (a, b) in connections {
            let path = NSBezierPath()
            path.move(to: points[a])
            path.line(to: points[b])
            path.lineWidth = 0.8
            path.stroke()
        }

        // Draw nodes
        let nodeRadius: CGFloat = 1.4
        for (i, p) in points.enumerated() {
            let isCenter = (i == 4)
            let r = isCenter ? nodeRadius * 1.3 : nodeRadius
            iconColor.withAlphaComponent(0.8).setFill()
            NSBezierPath(ovalIn: NSRect(
                x: p.x - r, y: p.y - r,
                width: r * 2, height: r * 2
            )).fill()
        }
    }

    private func drawStatusBadge(in rect: NSRect, status: OverallStatus) {
        let badgeRadius: CGFloat = 3.5
        let badgeCenter = NSPoint(
            x: rect.maxX - badgeRadius - 0.5,
            y: rect.minY + badgeRadius + 0.5
        )

        let color: NSColor
        switch status {
        case .allHealthy:  color = .systemGreen
        case .setupNeeded: color = .systemOrange
        case .degraded:    color = .systemYellow
        case .allDown:     color = .systemRed
        case .checking:    color = .systemGray
        }

        // White outline behind badge for contrast
        NSColor.white.setFill()
        NSBezierPath(ovalIn: NSRect(
            x: badgeCenter.x - badgeRadius - 1,
            y: badgeCenter.y - badgeRadius - 1,
            width: (badgeRadius + 1) * 2,
            height: (badgeRadius + 1) * 2
        )).fill()

        // Colored badge
        color.setFill()
        NSBezierPath(ovalIn: NSRect(
            x: badgeCenter.x - badgeRadius,
            y: badgeCenter.y - badgeRadius,
            width: badgeRadius * 2,
            height: badgeRadius * 2
        )).fill()
    }
}

// MARK: - Menu Content

struct MenuContent: View {
    @EnvironmentObject var manager: ServiceManager
    @State private var launchAtLogin = false

    var body: some View {
        // Overall status header
        HStack {
            Circle()
                .fill(overallColor)
                .frame(width: 8, height: 8)
            Text("Legion: \(manager.overallStatus.displayText)")
                .font(.headline)
        }

        Divider()

        // Individual service statuses
        ForEach(manager.services) { service in
            HStack {
                Circle()
                    .fill(statusColor(service.status))
                    .frame(width: 6, height: 6)
                Text(service.name.displayName)
                Spacer()
                Text(service.status.rawValue)
                    .foregroundColor(.secondary)
                    .font(.caption)
            }
        }

        Divider()

        // Control buttons
        Button("Start All Services") { manager.startAll() }
            .disabled(manager.overallStatus == .allHealthy)

        Button("Stop All Services") { manager.stopAll() }
            .disabled(manager.overallStatus == .allDown)

        Button("Restart Daemon") { manager.restartDaemon() }

        Divider()

        Button("Open Dashboard") {
            NSApp.delegate?.perform(#selector(AppDelegate.showDashboard))
        }

        Button("Open Web API") {
            if let url = URL(string: "http://localhost:4567") {
                NSWorkspace.shared.open(url)
            }
        }

        Divider()

        Toggle("Launch at Login", isOn: $launchAtLogin)
            .onChange(of: launchAtLogin) { newValue in
                setLaunchAtLogin(newValue)
            }

        Button("Quit") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }

    private var overallColor: Color {
        switch manager.overallStatus {
        case .allHealthy:  return .green
        case .setupNeeded: return .orange
        case .degraded:    return .yellow
        case .allDown:     return .red
        case .checking:    return .gray
        }
    }

    private func statusColor(_ status: ServiceStatus) -> Color {
        switch status {
        case .running:  return .green
        case .stopped:  return .red
        case .starting: return .yellow
        case .unknown:  return .gray
        }
    }

    private func setLaunchAtLogin(_ enabled: Bool) {
        if #available(macOS 13.0, *) {
            let service = SMAppService.mainApp
            do {
                if enabled {
                    try service.register()
                } else {
                    try service.unregister()
                }
            } catch {
                print("Failed to set login item: \(error)")
            }
        }
    }
}

// MARK: - OverallStatus Display

extension OverallStatus {
    var displayText: String {
        switch self {
        case .allHealthy:  return "All Systems Go"
        case .setupNeeded: return "Setup Required"
        case .degraded:    return "Degraded"
        case .allDown:     return "All Stopped"
        case .checking:    return "Checking..."
        }
    }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusWindow: NSWindow?
    var onboardingWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Keep alive as menu bar app
        NSApplication.shared.disableRelaunchOnLogin()
        ProcessInfo.processInfo.disableSuddenTermination()
        ProcessInfo.processInfo.disableAutomaticTermination("Menu bar app must stay running")

        // Set app icon
        NSApplication.shared.applicationIconImage = Self.generateAppIcon()

        // Check if onboarding is needed
        if ServiceManager.shared.setupNeeded {
            showOnboarding()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showDashboard() }
        return true
    }

    // MARK: - Window Management

    @MainActor @objc func showDashboard() {
        if let window = statusWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApplication.shared.activate(ignoringOtherApps: true)
            return
        }

        let contentView = StatusWindowView()
            .environmentObject(ServiceManager.shared)
        let hostingView = NSHostingView(rootView: contentView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 550),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Legion Interlink"
        window.contentView = hostingView
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.isReleasedWhenClosed = false

        statusWindow = window
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    @MainActor func showOnboarding() {
        if let window = onboardingWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApplication.shared.activate(ignoringOtherApps: true)
            return
        }

        let contentView = OnboardingView {
            DispatchQueue.main.async { [weak self] in
                self?.onboardingWindow?.close()
                self?.onboardingWindow = nil
            }
        }
        .environmentObject(ServiceManager.shared)
        let hostingView = NSHostingView(rootView: contentView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 550, height: 480),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Legion Interlink Setup"
        window.contentView = hostingView
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.isReleasedWhenClosed = false

        onboardingWindow = window
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    // MARK: - App Icon

    static func generateAppIcon() -> NSImage {
        let s: CGFloat = 512
        let image = NSImage(size: NSSize(width: s, height: s))
        image.lockFocus()

        guard let context = NSGraphicsContext.current?.cgContext else {
            image.unlockFocus()
            return image
        }

        // Background rounded rect with Legion purple gradient
        let bgPath = NSBezierPath(
            roundedRect: NSRect(x: 0, y: 0, width: s, height: s),
            xRadius: s * 0.22, yRadius: s * 0.22
        )
        bgPath.addClip()

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let colors = [
            NSColor(red: 0.07, green: 0.06, blue: 0.16, alpha: 1.0).cgColor,
            NSColor(red: 0.12, green: 0.09, blue: 0.25, alpha: 1.0).cgColor,
        ] as CFArray
        let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0.0, 1.0])!
        context.drawLinearGradient(gradient, start: CGPoint(x: 0, y: s), end: CGPoint(x: s, y: 0), options: [])

        // 3x3 Network grid — Legion branding
        let cx = s / 2, cy = s / 2
        let gridSpacing = s * 0.16
        let nodeColor = NSColor(red: 0.5, green: 0.47, blue: 0.87, alpha: 1.0) // Legion purple
        let litColor = NSColor(red: 0.77, green: 0.76, blue: 0.96, alpha: 1.0)

        var gridPoints: [CGPoint] = []
        for row in -1...1 {
            for col in -1...1 {
                gridPoints.append(CGPoint(
                    x: cx + CGFloat(col) * gridSpacing,
                    y: cy + CGFloat(row) * gridSpacing
                ))
            }
        }

        // "I" glyph lit nodes (top row, center col, bottom row)
        let litNodes: Set<Int> = [0, 1, 2, 4, 6, 7, 8]

        let connections: [(Int, Int)] = [
            (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),
            (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),
            (1, 3), (1, 5), (3, 7), (5, 7),
        ]
        let litEdges: Set<String> = ["0-1", "1-2", "1-4", "4-7", "6-7", "7-8"]

        // Draw connections
        for (a, b) in connections {
            let key = a < b ? "\(a)-\(b)" : "\(b)-\(a)"
            let isLit = litEdges.contains(key)
            let color = isLit
                ? litColor.withAlphaComponent(0.6)
                : nodeColor.withAlphaComponent(0.25)
            context.setStrokeColor(color.cgColor)
            context.setLineWidth(isLit ? s * 0.018 : s * 0.008)
            context.move(to: gridPoints[a])
            context.addLine(to: gridPoints[b])
            context.strokePath()
        }

        // Draw nodes
        let nodeRadius = s * 0.028
        for (i, p) in gridPoints.enumerated() {
            let isLit = litNodes.contains(i)
            let r = isLit ? nodeRadius * 1.2 : nodeRadius
            let fill = isLit ? litColor : nodeColor.withAlphaComponent(0.8)

            if isLit {
                // Glow
                litColor.withAlphaComponent(0.1).setFill()
                NSBezierPath(ovalIn: NSRect(x: p.x - r * 2.5, y: p.y - r * 2.5, width: r * 5, height: r * 5)).fill()
            }

            fill.setFill()
            NSBezierPath(ovalIn: NSRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)).fill()

            // Inner highlight
            NSColor.white.withAlphaComponent(isLit ? 0.7 : 0.4).setFill()
            let ir = r * 0.4
            NSBezierPath(ovalIn: NSRect(x: p.x - ir, y: p.y - ir, width: ir * 2, height: ir * 2)).fill()
        }

        // Frame
        let frameRect = NSRect(
            x: cx - gridSpacing * 1.5 - s * 0.04,
            y: cy - gridSpacing * 1.5 - s * 0.04,
            width: gridSpacing * 3 + s * 0.08,
            height: gridSpacing * 3 + s * 0.08
        )
        let frame = NSBezierPath(roundedRect: frameRect, xRadius: s * 0.06, yRadius: s * 0.06)
        frame.lineWidth = s * 0.012
        litColor.withAlphaComponent(0.4).setStroke()
        frame.stroke()

        image.unlockFocus()
        return image
    }
}
