import SwiftUI

// MARK: - Event Model

private struct EventItem: Identifiable {
    let id: String
    let timestamp: String
    let type: String
    let summary: String
}

// MARK: - Events Tab

struct EventsTab: View {
    @State private var events: [EventItem] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var autoRefresh = false
    @State private var refreshTimer: Timer?

    var body: some View {
        VStack(spacing: 0) {
            header

            if isLoading && events.isEmpty {
                Spacer()
                ProgressView()
                    .controlSize(.small)
                    .tint(TerminalTheme.accent)
                Spacer()
            } else if let error = errorMessage, events.isEmpty {
                errorView(error)
            } else if events.isEmpty {
                emptyView
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(events) { event in
                            eventRow(event)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .background(TerminalTheme.bg)
        .task { await loadEvents() }
        .onChange(of: autoRefresh) { enabled in
            if enabled {
                startAutoRefresh()
            } else {
                stopAutoRefresh()
            }
        }
        .onDisappear {
            stopAutoRefresh()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "bell")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("EVENTS")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if !events.isEmpty {
                Text("\(events.count)")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(TerminalTheme.accent.opacity(0.1))
                    .cornerRadius(3)
            }

            Spacer()

            Toggle(isOn: $autoRefresh) {
                Text("auto-refresh")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)
            }
            .toggleStyle(.checkbox)
            .controlSize(.small)

            Button(action: { Task { await loadEvents() } }) {
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

    // MARK: - Event Row

    private func eventRow(_ event: EventItem) -> some View {
        HStack(spacing: 10) {
            // Type indicator dot
            Circle()
                .fill(eventColor(event.type))
                .frame(width: 5, height: 5)

            // Timestamp
            Text(formatTimestamp(event.timestamp))
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.6))
                .frame(width: 70, alignment: .leading)

            // Type badge
            Text(event.type)
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(eventColor(event.type))
                .frame(width: 80, alignment: .leading)
                .lineLimit(1)

            // Summary
            Text(event.summary)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .lineLimit(2)

            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(4)
    }

    private func eventColor(_ type: String) -> Color {
        let t = type.lowercased()
        if t.contains("error") || t.contains("fail") { return TerminalTheme.red }
        if t.contains("warn") { return TerminalTheme.yellow }
        if t.contains("success") || t.contains("complete") { return TerminalTheme.green }
        if t.contains("task") || t.contains("worker") { return TerminalTheme.accent }
        return TerminalTheme.textDim
    }

    private func formatTimestamp(_ ts: String) -> String {
        // Try to extract just the time portion for compact display
        if ts.count > 11, let tIdx = ts.firstIndex(of: "T") {
            let timeStr = String(ts[ts.index(after: tIdx)...])
            if let dotIdx = timeStr.firstIndex(of: ".") {
                return String(timeStr[..<dotIdx])
            }
            return String(timeStr.prefix(8))
        }
        return String(ts.suffix(8))
    }

    // MARK: - Empty / Error

    private var emptyView: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "bell.slash")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.3))
            Text("No recent events")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.yellow)
            Text(message)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await loadEvents() } }
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Auto-refresh

    private func startAutoRefresh() {
        stopAutoRefresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            Task { await loadEvents() }
        }
    }

    private func stopAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    // MARK: - API

    private func loadEvents() async {
        if events.isEmpty { isLoading = true }
        errorMessage = nil

        let result = await DaemonAPI.get("/api/events/recent", query: ["count": "50"])
        await MainActor.run {
            if result.ok, let items = result.data as? [[String: Any]] {
                events = items.compactMap { parseEvent($0) }
            } else if !result.ok && events.isEmpty {
                errorMessage = "Failed to load events — is the daemon running?"
            }
            isLoading = false
        }
    }

    private func parseEvent(_ dict: [String: Any]) -> EventItem? {
        let id = dict["id"] as? String ?? dict["eventId"] as? String ?? UUID().uuidString
        let timestamp = dict["timestamp"] as? String ?? dict["created_at"] as? String ?? ""
        let type = dict["type"] as? String ?? dict["kind"] as? String ?? dict["event"] as? String ?? "unknown"
        let summary = dict["summary"] as? String ?? dict["message"] as? String ?? dict["description"] as? String ?? ""
        return EventItem(id: id, timestamp: timestamp, type: type, summary: summary)
    }
}
