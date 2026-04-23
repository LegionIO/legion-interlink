import SwiftUI
import AppKit

// MARK: - Shared Cursor Constants

/// Central place for cursor geometry so ChatNSTextView and TerminalTextField stay in sync.
enum TerminalCursor {
    static let width: CGFloat = 6
    static let color: NSColor = NSColor(TerminalTheme.text)
}

// MARK: - Block Cursor Field Editor

/// A field editor (NSTextView acting as a field editor for NSTextField) that draws
/// a solid, non-blinking block cursor instead of the default thin blue line.
///
/// This is the most reliable approach — it overrides drawing at the NSTextView level,
/// so SwiftUI/AppKit cannot revert the cursor color via tint or accent color changes.
private final class BlockCursorFieldEditor: NSTextView {

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    override init(frame frameRect: NSRect, textContainer container: NSTextContainer?) {
        super.init(frame: frameRect, textContainer: container)
        commonInit()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func commonInit() {
        isFieldEditor = true
        insertionPointColor = TerminalCursor.color
    }

    // Draw a wide block cursor, always "on" (no blink)
    override func drawInsertionPoint(in rect: NSRect, color: NSColor, turnedOn flag: Bool) {
        var blockRect = rect
        blockRect.size.width = TerminalCursor.width
        super.drawInsertionPoint(in: blockRect, color: TerminalCursor.color, turnedOn: true)
    }

    // Widen the dirty rect so the block cursor is fully erased/redrawn
    override func setNeedsDisplay(_ rect: NSRect, avoidAdditionalLayout flag: Bool) {
        var widened = rect
        widened.size.width += TerminalCursor.width + 2
        super.setNeedsDisplay(widened, avoidAdditionalLayout: flag)
    }

    // Disable the blink timer — always repaint as "on"
    override func updateInsertionPointStateAndRestartTimer(_ restartFlag: Bool) {
        super.updateInsertionPointStateAndRestartTimer(false)
        needsDisplay = true
    }
}

// MARK: - NSTextField Subclass

/// NSTextField that vends its own BlockCursorFieldEditor, ensuring the white block
/// cursor is used regardless of window delegate changes.
private final class BlockCursorNSTextField: NSTextField {

    private lazy var fieldEditor: BlockCursorFieldEditor = {
        let editor = BlockCursorFieldEditor(frame: .zero)
        return editor
    }()

    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        // Belt-and-suspenders: also set insertion point color on whatever editor the
        // window actually provided, in case our windowWillReturnFieldEditor was bypassed.
        if result, let editor = currentEditor() as? NSTextView {
            editor.insertionPointColor = TerminalCursor.color
        }
        return result
    }
}

// MARK: - Window Delegate for Field Editor

/// Installs itself as the window delegate so it can provide a BlockCursorFieldEditor
/// for every BlockCursorNSTextField. Forwards all other delegate calls to the original.
private final class FieldEditorProvider: NSObject, NSWindowDelegate {
    static let shared = FieldEditorProvider()
    private var fieldEditors: [ObjectIdentifier: BlockCursorFieldEditor] = [:]
    private weak var originalDelegate: NSWindowDelegate?
    private var installedWindows = Set<ObjectIdentifier>()

    func install(on window: NSWindow, for textField: NSTextField) {
        let windowID = ObjectIdentifier(window)
        if !installedWindows.contains(windowID) {
            originalDelegate = window.delegate
            window.delegate = self
            installedWindows.insert(windowID)
        }
        let tfID = ObjectIdentifier(textField)
        if fieldEditors[tfID] == nil {
            fieldEditors[tfID] = BlockCursorFieldEditor(frame: .zero)
        }
    }

    func windowWillReturnFieldEditor(_ sender: NSWindow, to client: Any?) -> Any? {
        if let tf = client as? BlockCursorNSTextField {
            return fieldEditors[ObjectIdentifier(tf)]
        }
        return originalDelegate?.windowWillReturnFieldEditor?(sender, to: client)
    }

    // Forward other delegate methods to original
    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return originalDelegate?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let orig = originalDelegate, orig.responds(to: aSelector) {
            return orig
        }
        return super.forwardingTarget(for: aSelector)
    }
}

// MARK: - SwiftUI Wrapper

/// A SwiftUI text field that renders a white block cursor, matching a terminal aesthetic.
///
/// Drop-in replacement for `TextField` with monospaced font and dark theme styling.
struct TerminalTextField: NSViewRepresentable {
    let placeholder: String
    @Binding var text: String
    var fontSize: CGFloat = 12
    var onSubmit: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSTextField {
        let tf = BlockCursorNSTextField()
        tf.isBordered = false
        tf.drawsBackground = false
        tf.backgroundColor = .clear
        tf.focusRingType = .none
        tf.font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        tf.textColor = NSColor(TerminalTheme.text)
        tf.placeholderAttributedString = NSAttributedString(
            string: placeholder,
            attributes: [
                .foregroundColor: NSColor(TerminalTheme.textDim),
                .font: NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
            ]
        )
        tf.delegate = context.coordinator
        tf.cell?.lineBreakMode = .byTruncatingTail
        tf.cell?.isScrollable = true
        return tf
    }

    func updateNSView(_ tf: NSTextField, context: Context) {
        context.coordinator.parent = self
        if tf.stringValue != text {
            tf.stringValue = text
        }
        tf.font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)

        // Install field editor provider when the text field has a window
        if let window = tf.window {
            FieldEditorProvider.shared.install(on: window, for: tf)
        }
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: TerminalTextField

        init(_ parent: TerminalTextField) {
            self.parent = parent
        }

        func controlTextDidChange(_ obj: Notification) {
            if let tf = obj.object as? NSTextField {
                parent.text = tf.stringValue
            }
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                parent.onSubmit?()
                return true
            }
            return false
        }
    }
}

// MARK: - Terminal Search Box

/// A reusable search box matching the terminal theme, with a fixed-width layout
/// and a clear button that doesn't cause the box to resize.
struct TerminalSearchBox: View {
    @Binding var text: String
    var placeholder: String = "search..."
    var width: CGFloat = 120

    private var clearButtonWidth: CGFloat { 14 }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 10))
                .foregroundColor(TerminalTheme.textDim)

            TerminalTextField(
                placeholder: placeholder,
                text: $text,
                fontSize: 10
            )
            .frame(width: text.isEmpty ? width : width - clearButtonWidth)

            if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 9))
                        .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                }
                .buttonStyle(.plain)
                .frame(width: clearButtonWidth)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(4)
    }
}
