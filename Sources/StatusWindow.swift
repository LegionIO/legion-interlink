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
    static let green = Color(red: 0.30, green: 0.85, blue: 0.45)
    static let red = Color(red: 0.95, green: 0.35, blue: 0.35)
    static let yellow = Color(red: 0.95, green: 0.80, blue: 0.25)
    static let gray = Color(red: 0.45, green: 0.45, blue: 0.48)
}

// MARK: - Chat Message Model

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String // "user" or "assistant"
    let content: String
    let timestamp: Date
}

// MARK: - Multiline Chat Input (NSViewRepresentable)

struct ChatInputView: NSViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat
    var isFocused: FocusState<Bool>.Binding
    var isDisabled: Bool
    var onSubmit: () -> Void
    var onHistoryUp: (() -> Void)? = nil
    var onHistoryDown: (() -> Void)? = nil

    static let minHeight: CGFloat = 20
    static let maxHeight: CGFloat = 120

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder

        let textView = ChatNSTextView()
        textView.delegate = context.coordinator
        textView.onSubmit = onSubmit
        textView.onHistoryUp = onHistoryUp
        textView.onHistoryDown = onHistoryDown
        textView.isRichText = false
        textView.allowsUndo = true
        textView.drawsBackground = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.textColor = NSColor(TerminalTheme.text)
        textView.insertionPointColor = TerminalCursor.color
        textView.isEditable = !isDisabled
        textView.isSelectable = true
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainerInset = NSSize(width: 0, height: 2)
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.lineBreakMode = .byWordWrapping
        textView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        scrollView.documentView = textView
        context.coordinator.textView = textView

        // Auto-focus when the view is added to a window
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            if let window = textView.window {
                window.makeFirstResponder(textView)
            }
        }

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? ChatNSTextView else { return }

        if textView.string != text {
            textView.string = text
            context.coordinator.recalcHeight(textView)
        }

        textView.onSubmit = onSubmit
        textView.onHistoryUp = onHistoryUp
        textView.onHistoryDown = onHistoryDown
        textView.isEditable = !isDisabled

        if isFocused.wrappedValue {
            DispatchQueue.main.async {
                guard let window = textView.window else { return }
                if window.firstResponder !== textView {
                    window.makeFirstResponder(textView)
                }
                // Force cursor redraw after focus
                textView.needsDisplay = true
            }
        }
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ChatInputView
        weak var textView: NSTextView?

        init(_ parent: ChatInputView) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
            recalcHeight(textView)
        }

        func recalcHeight(_ textView: NSTextView) {
            guard let container = textView.textContainer,
                  let layoutManager = textView.layoutManager else { return }
            layoutManager.ensureLayout(for: container)
            let usedRect = layoutManager.usedRect(for: container)
            let inset = textView.textContainerInset
            let newHeight = min(
                max(usedRect.height + inset.height * 2, ChatInputView.minHeight),
                ChatInputView.maxHeight
            )
            DispatchQueue.main.async {
                self.parent.height = newHeight
            }
        }
    }
}

// Custom NSTextView to intercept Enter vs Shift/Option+Enter
private class ChatNSTextView: NSTextView {
    var onSubmit: (() -> Void)?
    var onHistoryUp: (() -> Void)?
    var onHistoryDown: (() -> Void)?

    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        insertionPointColor = TerminalCursor.color
        // Kick the insertion point state so drawInsertionPoint gets called
        super.updateInsertionPointStateAndRestartTimer(false)
        needsDisplay = true
        return result
    }

    // Draw a solid, non-blinking block cursor
    override func drawInsertionPoint(in rect: NSRect, color: NSColor, turnedOn flag: Bool) {
        // Ignore the turnedOn flag entirely — always draw
        var blockRect = rect
        blockRect.size.width = TerminalCursor.width
        TerminalCursor.color.setFill()
        NSBezierPath(rect: blockRect).fill()
    }

    override func setNeedsDisplay(_ rect: NSRect, avoidAdditionalLayout flag: Bool) {
        var widened = rect
        widened.size.width += TerminalCursor.width + 2
        super.setNeedsDisplay(widened, avoidAdditionalLayout: flag)
    }

    // Kill the blink timer — always pass false to prevent restart,
    // but still call super so macOS tracks insertion point position
    override func updateInsertionPointStateAndRestartTimer(_ restartFlag: Bool) {
        super.updateInsertionPointStateAndRestartTimer(false)
        needsDisplay = true
    }

    override func keyDown(with event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let isReturn = event.keyCode == 36
        let isUpArrow = event.keyCode == 126
        let isDownArrow = event.keyCode == 125

        if isReturn {
            let hasShift = flags.contains(.shift)
            let hasOption = flags.contains(.option)

            if hasShift || hasOption {
                // Shift+Enter or Option+Enter: insert newline (expand)
                insertNewline(nil)
                return
            } else if flags.isEmpty || flags == .numericPad {
                // Plain Enter: submit message
                onSubmit?()
                return
            }
        }

        // Up/Down arrow: cycle history when the input is a single line
        // (no newlines), or when the cursor is on the first/last line
        if flags.isEmpty || flags == .numericPad {
            if isUpArrow, let onHistoryUp {
                let isSingleLine = !string.contains("\n")
                let cursorAtFirstLine = isSingleLine || selectedRange().location == 0
                    || string[string.startIndex..<string.index(string.startIndex, offsetBy: min(selectedRange().location, string.count))].contains("\n") == false
                if isSingleLine || cursorAtFirstLine {
                    onHistoryUp()
                    return
                }
            }
            if isDownArrow, let onHistoryDown {
                let isSingleLine = !string.contains("\n")
                let cursorAtLastLine: Bool = {
                    let pos = selectedRange().location
                    if pos >= string.count { return true }
                    let remaining = string[string.index(string.startIndex, offsetBy: pos)...]
                    return !remaining.contains("\n")
                }()
                if isSingleLine || cursorAtLastLine {
                    onHistoryDown()
                    return
                }
            }
        }

        super.keyDown(with: event)
    }
}

// MARK: - Pulsing Status Text

private struct PulsingStatusText: View {
    let status: ServiceStatus
    @State private var pulse = false

    private var isTransitioning: Bool {
        status == .starting || status == .stopping
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
        Text(status.rawValue.lowercased())
            .font(.system(size: 10, design: .monospaced))
            .foregroundColor(color)
            .opacity(isTransitioning && pulse ? 0.3 : 1.0)
            .onAppear {
                if isTransitioning {
                    withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                        pulse = true
                    }
                }
            }
            .onChange(of: status) { newStatus in
                let transitioning = newStatus == .starting || newStatus == .stopping
                if transitioning {
                    pulse = false
                    withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                        pulse = true
                    }
                } else {
                    withAnimation(.default) {
                        pulse = false
                    }
                }
            }
    }
}

// MARK: - Status Window View

struct StatusWindowView: View {
    @EnvironmentObject var manager: ServiceManager
    @State private var selectedTab = 0
    @State private var hasAppeared = false

    private static let tabChat = 0
    private static let tabLogs = 1
    private static let tabServices = 2
    private static let tabExtensions = 3
    private static let tabWorkers = 4
    private static let tabSettings = 5

    var body: some View {
        VStack(spacing: 0) {
            // Title bar area
            titleBar

            // Tab bar
            tabBar

            // Tab content
            Group {
                switch selectedTab {
                case Self.tabServices: ServicesTab()
                case Self.tabChat: ChatTab()
                case Self.tabLogs: LogsTab()
                case Self.tabExtensions: ExtensionsTab()
                case Self.tabWorkers: WorkersTab()
                case Self.tabSettings: DaemonSettingsTab()
                default: ServicesTab()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(TerminalTheme.bg)
        .frame(minWidth: 700, minHeight: 520)
        .preferredColorScheme(.dark)
        .onAppear {
            if !hasAppeared {
                hasAppeared = true
                if manager.overallStatus != .online {
                    selectedTab = Self.tabServices
                } else {
                    selectedTab = Self.tabChat
                }
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

            (Text("Legion")
                .foregroundColor(TerminalTheme.accent)
            + Text("IO")
                .foregroundColor(TerminalTheme.text))
                .font(.system(size: 14, weight: .semibold, design: .monospaced))

            statusPill

            Spacer()

            if let lastChecked = manager.lastChecked {
                Text(lastChecked, style: .time)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(TerminalTheme.surfaceBg)
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

        return HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
                .shadow(color: color.opacity(0.6), radius: 3)

            Text(manager.overallStatus.displayText.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(color.opacity(0.1))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(color.opacity(0.3), lineWidth: 1)
        )
        .cornerRadius(4)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                tabButton(title: "Chat", icon: "bubble.left.and.bubble.right", index: Self.tabChat)
                tabButton(title: "Logs", icon: "terminal", index: Self.tabLogs)
                tabButton(title: "Services", icon: "server.rack", index: Self.tabServices)
                tabButton(title: "Extensions", icon: "puzzlepiece.extension", index: Self.tabExtensions)
                tabButton(title: "Workers", icon: "gearshape.2", index: Self.tabWorkers)
                tabButton(title: "Settings", icon: "gearshape", index: Self.tabSettings)
            }
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
        return Button(action: { selectedTab = index }) {
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
                    // Service Cards
                    ForEach(manager.services) { service in
                        if service.name == .legionio {
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

    // MARK: - Daemon Card (LegionIO with components)

    private func daemonCard(_ service: ServiceState) -> some View {
        VStack(spacing: 0) {
            // Main service row
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

                // Control buttons: start/stop
                HStack(spacing: 6) {
                    if service.status == .stopping || service.status == .starting {
                        // No button while transitioning
                    } else if service.status == .running {
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

            // Daemon Components (inline)
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
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(6)
    }

    // MARK: - Standard Service Card

    private func serviceCard(_ service: ServiceState) -> some View {
        HStack(spacing: 12) {
            // Status indicator
            statusDot(service.status)

            // Service info
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

            // Control button
            if service.status == .stopping || service.status == .starting {
                // No button while transitioning
            } else if service.status == .running {
                terminalButton("stop", color: TerminalTheme.red) {
                    manager.stopService(service.name)
                }
            } else {
                terminalButton("start", color: TerminalTheme.green) {
                    manager.startService(service.name)
                }
            }
        }
        .padding(12)
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(6)
    }

    private func statusDot(_ status: ServiceStatus) -> some View {
        let color = statusColor(status)
        return ZStack {
            Circle()
                .fill(color.opacity(0.2))
                .frame(width: 20, height: 20)
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
                .shadow(color: color.opacity(0.5), radius: 4)
        }
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
        Button(action: action) {
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(color)
                .frame(minWidth: 40)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(color.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(color.opacity(0.3), lineWidth: 1)
                )
                .cornerRadius(4)
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

}

// MARK: - Chat Tab

struct ChatTab: View {
    @EnvironmentObject var manager: ServiceManager
    @StateObject private var store = ChatStore.shared
    @State private var inputText: String = ""
    @State private var isStreaming = false
    @State private var inputHeight: CGFloat = ChatInputView.minHeight
    @FocusState private var isInputFocused: Bool

    /// Index into the user message history. -1 means "not browsing history" (showing current draft).
    @State private var historyIndex: Int = -1
    /// Saves the in-progress draft so it can be restored after cycling through history.
    @State private var savedDraft: String = ""

    private var userMessages: [String] {
        store.messages.filter { $0.role == "user" }.map(\.content)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header bar
            chatHeader

            // Messages area
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if store.messages.isEmpty {
                            emptyState
                        }
                        ForEach(store.messages) { message in
                            chatBubble(message)
                        }
                        if isStreaming {
                            streamingIndicator
                        }
                    }
                    .padding(16)
                    .id("chatBottom")
                }
                .onChange(of: store.messages.count) { _ in
                    withAnimation {
                        proxy.scrollTo("chatBottom", anchor: .bottom)
                    }
                }
            }
            .background(TerminalTheme.bg)

            // Input bar
            inputBar
        }
        .onAppear {
            // Delay slightly so the NSTextView has been added to the window
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isInputFocused = true
            }
        }
    }

    // MARK: - Header

    private var chatHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("CHAT")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            Text("— LLM inference")
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.5))

            if !store.messages.isEmpty {
                Text("\(store.messages.count)")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(TerminalTheme.accent.opacity(0.1))
                    .cornerRadius(3)
            }

            Spacer()

            Button(action: {
                withAnimation(.easeInOut(duration: 0.2)) {
                    store.clearAll()
                    inputText = ""
                    inputHeight = ChatInputView.minHeight
                }
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "xmark.circle")
                        .font(.system(size: 10))
                    Text("clear chat")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                }
                .foregroundColor(TerminalTheme.textDim)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(TerminalTheme.textDim.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(TerminalTheme.textDim.opacity(0.2), lineWidth: 1)
                )
                .cornerRadius(3)
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .disabled(store.messages.isEmpty && !isStreaming)
            .opacity(store.messages.isEmpty && !isStreaming ? 0.4 : 1.0)
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

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 60)
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 32))
                .foregroundColor(TerminalTheme.accent.opacity(0.4))
            Text("Chat with Legion")
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
            Text("Send a message to the LLM inference endpoint")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.6))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func chatBubble(_ message: ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            // Role indicator
            Text(message.role == "user" ? ">" : "$")
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundColor(message.role == "user" ? TerminalTheme.accent : TerminalTheme.green)
                .frame(width: 16)

            VStack(alignment: .leading, spacing: 4) {
                Text(message.role == "user" ? "you" : "legion")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(message.role == "user" ? TerminalTheme.accent : TerminalTheme.green)
                    .textCase(.uppercase)

                Text(message.content)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(TerminalTheme.text)
                    .textSelection(.enabled)
            }

            Spacer()
        }
        .padding(10)
        .background(
            message.role == "user"
                ? TerminalTheme.accent.opacity(0.05)
                : TerminalTheme.green.opacity(0.03)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(
                    message.role == "user"
                        ? TerminalTheme.accent.opacity(0.15)
                        : TerminalTheme.green.opacity(0.1),
                    lineWidth: 1
                )
        )
        .cornerRadius(6)
    }

    private var streamingIndicator: some View {
        HStack(spacing: 8) {
            Text("$")
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.green)
                .frame(width: 16)

            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(TerminalTheme.green)
                        .frame(width: 4, height: 4)
                        .opacity(0.6)
                }
            }

            Spacer()
        }
        .padding(10)
    }

    private var inputBar: some View {
        VStack(spacing: 0) {
            // Top separator
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1)

            HStack(alignment: .top, spacing: 10) {
                Text(">")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.accent)
                    .padding(.top, 1)

                ChatInputView(
                    text: $inputText,
                    height: $inputHeight,
                    isFocused: $isInputFocused,
                    isDisabled: false,
                    onSubmit: sendMessage,
                    onHistoryUp: historyUp,
                    onHistoryDown: historyDown
                )
                .frame(height: inputHeight)

                if isStreaming {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.7)
                        .padding(.top, 2)
                }

                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(inputText.isEmpty ? TerminalTheme.textDim : TerminalTheme.accent)
                }
                .buttonStyle(.plain)
                .pointerCursor()
                .disabled(inputText.isEmpty)
                .padding(.top, 2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            // Bottom separator
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1)
        }
        .background(TerminalTheme.surfaceBg)
        .padding(.bottom, 12)
    }

    // MARK: - History Navigation

    private func historyUp() {
        let history = userMessages
        guard !history.isEmpty else { return }

        if historyIndex == -1 {
            // Entering history — save current draft
            savedDraft = inputText
            historyIndex = history.count - 1
        } else if historyIndex > 0 {
            historyIndex -= 1
        } else {
            return // already at oldest
        }
        inputText = history[historyIndex]
    }

    private func historyDown() {
        let history = userMessages
        guard historyIndex >= 0 else { return }

        if historyIndex < history.count - 1 {
            historyIndex += 1
            inputText = history[historyIndex]
        } else {
            // Past newest — restore draft
            historyIndex = -1
            inputText = savedDraft
        }
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let userMessage = ChatMessage(role: "user", content: text, timestamp: Date())
        store.append(userMessage)
        inputText = ""
        inputHeight = ChatInputView.minHeight
        historyIndex = -1
        savedDraft = ""
        isStreaming = true
        isInputFocused = true

        Task {
            let response = await callInferenceAPI(prompt: text)
            await MainActor.run {
                let assistantMessage = ChatMessage(
                    role: "assistant",
                    content: response,
                    timestamp: Date()
                )
                store.append(assistantMessage)
                isStreaming = false
                isInputFocused = true
            }
        }
    }

    private func callInferenceAPI(prompt: String) async -> String {
        let url = URL(string: "http://localhost:\(ServiceManager.daemonPort)/api/llm/inference")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        // Build conversation history for context
        var conversationMessages: [[String: String]] = []
        for msg in store.messages {
            conversationMessages.append([
                "role": msg.role,
                "content": msg.content
            ])
        }
        // Add the current prompt
        conversationMessages.append(["role": "user", "content": prompt])

        let body: [String: Any] = [
            "messages": conversationMessages,
            "prompt": prompt
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    // Try common response shapes
                    if let dataObj = json["data"] as? [String: Any] {
                        if let content = dataObj["content"] as? String { return content }
                        if let text = dataObj["text"] as? String { return text }
                        if let response = dataObj["response"] as? String { return response }
                        if let message = dataObj["message"] as? String { return message }
                    }
                    if let content = json["content"] as? String { return content }
                    if let text = json["text"] as? String { return text }
                    if let response = json["response"] as? String { return response }
                    if let message = json["message"] as? String { return message }

                    // Fallback: return raw JSON
                    if let prettyData = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
                       let prettyString = String(data: prettyData, encoding: .utf8) {
                        return prettyString
                    }
                }

                // Fallback: return raw text
                if let text = String(data: data, encoding: .utf8), !text.isEmpty {
                    return text
                }
            } else if let httpResponse = response as? HTTPURLResponse {
                return "[error] HTTP \(httpResponse.statusCode)"
            }
        } catch let error as URLError where error.code == .cannotConnectToHost {
            return "[error] daemon is not running — start the LegionIO daemon first"
        } catch {
            return "[error] \(error.localizedDescription)"
        }

        return "[error] unexpected response"
    }
}

// MARK: - Terminal Checkbox Style

struct TerminalCheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) {
            ZStack {
                RoundedRectangle(cornerRadius: 3.5)
                    .fill(configuration.isOn ? TerminalTheme.accent : TerminalTheme.cardBg)
                    .frame(width: 14, height: 14)

                RoundedRectangle(cornerRadius: 3.5)
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

                Text("— ~/.legionio/legionio/logs/legion.log")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))

                Spacer()

                Toggle(isOn: $autoScroll) {
                    Text("auto-scroll")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                }
                .toggleStyle(TerminalCheckboxStyle())

                Button(action: { manager.clearLogs() }) {
                    HStack(spacing: 4) {
                        Image(systemName: "xmark.circle")
                            .font(.system(size: 10))
                        Text("clear logs")
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                    }
                    .foregroundColor(TerminalTheme.textDim)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(TerminalTheme.textDim.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .stroke(TerminalTheme.textDim.opacity(0.2), lineWidth: 1)
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

            // Log content
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    Text(manager.logContents.isEmpty ? "waiting for log output..." : manager.logContents)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(
                            manager.logContents.isEmpty
                                ? TerminalTheme.textDim
                                : TerminalTheme.green.opacity(0.85)
                        )
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(12)

                    Color.clear
                        .frame(height: 1)
                        .id("logEnd")
                }
                .background(TerminalTheme.bg)
                .onChange(of: manager.logContents) { _ in
                    if autoScroll {
                        withAnimation(.easeOut(duration: 0.1)) {
                            proxy.scrollTo("logEnd", anchor: .bottom)
                        }
                    }
                }
            }
        }
        .onAppear { manager.startFastLogPolling() }
        .onDisappear { manager.stopFastLogPolling() }
    }
}

// NOTE: Tab views (ExtensionsTab, WorkersTab, TasksTab, EventsTab, DaemonSettingsTab)
// are defined in their own dedicated files.

