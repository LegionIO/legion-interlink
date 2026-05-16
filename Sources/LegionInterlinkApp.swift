import SwiftUI
import AppKit
import ServiceManagement

@main
struct LegionInterlinkApp: App {
    @StateObject private var manager = ServiceManager.shared
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

// MARK: - OverallStatus Display

extension OverallStatus {
    var displayText: String {
        switch self {
        case .online:      return "Online"
        case .setupNeeded: return "Setup Required"
        case .offline:     return "Offline"
        case .checking:    return "Checking..."
        }
    }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
    var statusItem: NSStatusItem?
    var statusWindow: NSWindow?
    var onboardingWindow: NSWindow?
    private var statusObservation: NSKeyValueObservation?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu bar only — hide from Dock
        NSApplication.shared.setActivationPolicy(.accessory)

        // Keep alive as menu bar app
        NSApplication.shared.disableRelaunchOnLogin()
        ProcessInfo.processInfo.disableSuddenTermination()
        ProcessInfo.processInfo.disableAutomaticTermination("Menu bar app must stay running")

        // Set app icon
        NSApplication.shared.applicationIconImage = Self.generateAppIcon()

        // Set up status bar item
        setupStatusItem()

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

    // MARK: - Status Item

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            button.image = menuBarIcon(for: .checking)
            button.target = self
            button.action = #selector(statusItemClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        // Observe status changes to update the icon
        // Poll every second on main run loop
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.statusItem?.button?.image = self.menuBarIcon(for: ServiceManager.shared.overallStatus)
            }
        }
    }

    @MainActor @objc private func statusItemClicked(_ sender: Any?) {
        guard let event = NSApp.currentEvent else {
            showDashboard()
            return
        }

        if event.type == .rightMouseUp {
            // Right-click: show context menu
            showContextMenu()
        } else {
            // Left-click: open dashboard
            showDashboard()
        }
    }

    @MainActor private func showContextMenu() {
        let menu = NSMenu()

        let statusText = "Legion: \(ServiceManager.shared.overallStatus.displayText)"
        let statusItem = NSMenuItem(title: statusText, action: nil, keyEquivalent: "")
        statusItem.isEnabled = false
        menu.addItem(statusItem)

        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Open Dashboard", action: #selector(showDashboard), keyEquivalent: "d"))

        menu.addItem(.separator())

        let launchItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin(_:)), keyEquivalent: "")
        if SMAppService.mainApp.status == .enabled {
            launchItem.state = .on
        }
        menu.addItem(launchItem)

        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        if let button = self.statusItem?.button {
            self.statusItem?.menu = menu
            menu.delegate = self
            button.performClick(nil)
        }
    }

    // Clear menu after it closes so left-click works again
    func menuDidClose(_ menu: NSMenu) {
        statusItem?.menu = nil
    }

    @objc private func toggleLaunchAtLogin(_ sender: NSMenuItem) {
        let service = SMAppService.mainApp
        do {
            if sender.state == .on {
                try service.unregister()
            } else {
                try service.register()
            }
        } catch {
            print("Failed to set login item: \(error)")
        }
    }

    // MARK: - Window Management

    @MainActor @objc func showDashboard() {
        if let window = statusWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let contentView = StatusWindowView()
            .environmentObject(ServiceManager.shared)
        let hostingView = NSHostingView(rootView: contentView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 550),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Legion Interlink"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.contentView = hostingView
        window.center()
        window.isReleasedWhenClosed = false
        window.delegate = self
        // Allow the window to receive focus even in accessory mode
        window.level = .floating
        window.makeKeyAndOrderFront(nil)
        window.level = .normal
        NSApp.activate(ignoringOtherApps: true)

        statusWindow = window
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow else { return }
        if closingWindow === statusWindow {
            statusWindow = nil
        } else if closingWindow === onboardingWindow {
            onboardingWindow = nil
        }
    }

    @MainActor func showOnboarding() {
        if let window = onboardingWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
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
        window.isReleasedWhenClosed = false
        // Allow focus in accessory mode
        window.level = .floating
        window.makeKeyAndOrderFront(nil)
        window.level = .normal
        NSApp.activate(ignoringOtherApps: true)

        onboardingWindow = window
    }

    // MARK: - Menu Bar Icon

    private func menuBarIcon(for status: OverallStatus) -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: false) { rect in
            self.drawLegionIcon(in: rect)
            self.drawStatusBadge(in: rect, status: status)
            return true
        }
        image.isTemplate = false
        return image
    }

    private func drawLegionIcon(in rect: NSRect) {
        let s = rect.width
        let iconColor = NSColor.white

        let padding: CGFloat = 2.5
        let gridSize = s - padding * 2 - 2
        let step = gridSize / 2
        let offsetX: CGFloat = padding
        let offsetY: CGFloat = padding

        let points: [NSPoint] = (0..<3).flatMap { row in
            (0..<3).map { col in
                NSPoint(
                    x: offsetX + CGFloat(col) * step,
                    y: offsetY + CGFloat(row) * step
                )
            }
        }

        let connections: [(Int, Int)] = [
            (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),
            (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),
            (1, 3), (1, 5), (3, 7), (5, 7),
        ]

        iconColor.withAlphaComponent(0.5).setStroke()
        for (a, b) in connections {
            let path = NSBezierPath()
            path.move(to: points[a])
            path.line(to: points[b])
            path.lineWidth = 0.7
            path.stroke()
        }

        let nodeRadius: CGFloat = 1.5
        for (i, p) in points.enumerated() {
            let isCenter = (i == 4)
            let r = isCenter ? nodeRadius * 1.4 : nodeRadius
            iconColor.setFill()
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
            y: rect.maxY - badgeRadius - 0.5
        )

        let color: NSColor
        switch status {
        case .online:      color = .systemGreen
        case .setupNeeded: color = .systemOrange
        case .offline:     color = .systemRed
        case .checking:    color = .systemGray
        }

        color.setFill()
        NSBezierPath(ovalIn: NSRect(
            x: badgeCenter.x - badgeRadius,
            y: badgeCenter.y - badgeRadius,
            width: badgeRadius * 2,
            height: badgeRadius * 2
        )).fill()
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

        let cx = s / 2, cy = s / 2
        let gridSpacing = s * 0.16
        let nodeColor = NSColor(red: 0.5, green: 0.47, blue: 0.87, alpha: 1.0)
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

        let litNodes: Set<Int> = [0, 1, 2, 4, 6, 7, 8]

        let connections: [(Int, Int)] = [
            (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),
            (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),
            (1, 3), (1, 5), (3, 7), (5, 7),
        ]
        let litEdges: Set<String> = ["0-1", "1-2", "1-4", "4-7", "6-7", "7-8"]

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

        let nodeRadius = s * 0.028
        for (i, p) in gridPoints.enumerated() {
            let isLit = litNodes.contains(i)
            let r = isLit ? nodeRadius * 1.2 : nodeRadius
            let fill = isLit ? litColor : nodeColor.withAlphaComponent(0.8)

            if isLit {
                litColor.withAlphaComponent(0.1).setFill()
                NSBezierPath(ovalIn: NSRect(x: p.x - r * 2.5, y: p.y - r * 2.5, width: r * 5, height: r * 5)).fill()
            }

            fill.setFill()
            NSBezierPath(ovalIn: NSRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)).fill()

            NSColor.white.withAlphaComponent(isLit ? 0.7 : 0.4).setFill()
            let ir = r * 0.4
            NSBezierPath(ovalIn: NSRect(x: p.x - ir, y: p.y - ir, width: ir * 2, height: ir * 2)).fill()
        }

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
