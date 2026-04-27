import SwiftUI
import AppKit

// MARK: - NSTextField subclass with white cursor

/// NSTextField subclass that forces a white insertion point on the field editor.
/// `becomeFirstResponder` fires after the window installs the field editor,
/// so we can reliably grab it and override the color.
private final class WhiteCursorTextField: NSTextField {
    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        if result, let editor = currentEditor() as? NSTextView {
            editor.insertionPointColor = .white
        }
        return result
    }
}

// MARK: - Stable Text Field (NSViewRepresentable)

/// Minimal NSTextField wrapper that avoids the vertical text jump caused by
/// SwiftUI's `.plain` TextField style swapping to a field editor on focus.
private struct StableTextField: NSViewRepresentable {
    let placeholder: String
    @Binding var text: String
    var fontSize: CGFloat = 10

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSTextField {
        let tf = WhiteCursorTextField()
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
        tf.cell?.usesSingleLineMode = true
        (tf.cell as? NSTextFieldCell)?.isScrollable = false
        return tf
    }

    func updateNSView(_ tf: NSTextField, context: Context) {
        context.coordinator.textBinding = $text
        if tf.stringValue != text {
            tf.stringValue = text
        }
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var textBinding: Binding<String>

        init(text: Binding<String>) {
            self.textBinding = text
        }

        func controlTextDidChange(_ obj: Notification) {
            if let tf = obj.object as? NSTextField {
                textBinding.wrappedValue = tf.stringValue
            }
        }
    }
}

// MARK: - Terminal Search Box

/// A reusable search box matching the terminal theme, with a fixed-width layout
/// and a clear button that doesn't cause the box to resize.
struct TerminalSearchBox: View {
    @Binding var text: String
    var placeholder: String = "search..."
    var width: CGFloat = 150

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 10))
                .foregroundColor(TerminalTheme.textDim)

            StableTextField(placeholder: placeholder, text: $text)

            Button(action: { text = "" }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 9))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            }
            .buttonStyle(.plain)
            .opacity(text.isEmpty ? 0 : 1)
            .allowsHitTesting(!text.isEmpty)
        }
        .frame(width: width, height: 20, alignment: .leading)
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(5)
    }
}
