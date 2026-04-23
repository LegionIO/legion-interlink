import SwiftUI
import AppKit

// MARK: - Pointer Cursor View

/// An invisible NSView overlay that sets the pointing-hand cursor via a tracking area.
/// More reliable than NSCursor.push/pop which SwiftUI can override.
private final class PointerCursorView: NSView {
    private var trackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = trackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.activeInActiveApp, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingArea = area
    }

    override func mouseEntered(with event: NSEvent) {
        NSCursor.pointingHand.set()
    }

    override func mouseExited(with event: NSEvent) {
        NSCursor.arrow.set()
    }

    // Pass all mouse events through to the views underneath
    override func hitTest(_ point: NSPoint) -> NSView? {
        return nil
    }
}

private struct PointerCursorRepresentable: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = PointerCursorView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

// MARK: - View Extension

extension View {
    func pointerCursor() -> some View {
        overlay(PointerCursorRepresentable())
    }
}
