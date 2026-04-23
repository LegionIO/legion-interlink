import SwiftUI

// MARK: - Status Window View

struct StatusWindowView: View {
    @EnvironmentObject var manager: ServiceManager

    @State private var showingDaemonLog = true

    var body: some View {
        VStack(spacing: 0) {
            headerSection
            Divider()
            servicesSection
            Divider()
            controlsSection
                .padding()
            Divider()
            logSection
        }
        .frame(minWidth: 650, minHeight: 500)
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 12) {
            overallStatusDot
            VStack(alignment: .leading, spacing: 2) {
                Text("Legion Interlink")
                    .font(.headline)
                Text(manager.overallStatus.displayText)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Spacer()
            if let lastChecked = manager.lastChecked {
                Text("Last check: \(lastChecked, style: .time)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var overallStatusDot: some View {
        Circle()
            .fill(overallColor)
            .frame(width: 14, height: 14)
            .shadow(color: overallColor.opacity(0.5), radius: 4)
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

    // MARK: - Services

    private var servicesSection: some View {
        VStack(spacing: 0) {
            ForEach(manager.services) { service in
                serviceRow(service)
                if service.name != ServiceName.allCases.last {
                    Divider().padding(.horizontal)
                }
            }

            // Daemon components (if daemon is running)
            if !manager.daemonReadiness.components.isEmpty {
                Divider()
                componentReadinessSection
            }
        }
    }

    private func serviceRow(_ service: ServiceState) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(statusColor(service.status))
                .frame(width: 10, height: 10)
                .shadow(color: statusColor(service.status).opacity(0.3), radius: 2)

            VStack(alignment: .leading, spacing: 1) {
                Text(service.name.displayName)
                    .font(.body)
                if let pid = service.pid {
                    Text("PID: \(pid)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            Text(service.status.rawValue)
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(statusColor(service.status).opacity(0.1))
                .cornerRadius(4)

            // Individual service controls
            if service.status == .running || service.status == .starting {
                Button(action: { manager.stopService(service.name) }) {
                    Image(systemName: "stop.fill")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Stop \(service.name.displayName)")
            } else {
                Button(action: { manager.startService(service.name) }) {
                    Image(systemName: "play.fill")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Start \(service.name.displayName)")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var componentReadinessSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Daemon Components")
                .font(.caption)
                .foregroundColor(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal)
                .padding(.top, 6)

            LazyVGrid(columns: [
                GridItem(.adaptive(minimum: 140), spacing: 8)
            ], spacing: 4) {
                ForEach(
                    manager.daemonReadiness.components.sorted(by: { $0.key < $1.key }),
                    id: \.key
                ) { component, ready in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(ready ? Color.green : Color.yellow)
                            .frame(width: 6, height: 6)
                        Text(component)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
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

    // MARK: - Controls

    private var controlsSection: some View {
        HStack(spacing: 12) {
            Button(action: manager.startAll) {
                Label("Start All", systemImage: "play.fill")
            }
            .disabled(manager.overallStatus == .allHealthy)

            Button(action: manager.stopAll) {
                Label("Stop All", systemImage: "stop.fill")
            }
            .disabled(manager.overallStatus == .allDown)

            Button(action: manager.restartDaemon) {
                Label("Restart Daemon", systemImage: "arrow.clockwise")
            }

            Spacer()

            Button(action: {
                if let url = URL(string: "http://localhost:4567") {
                    NSWorkspace.shared.open(url)
                }
            }) {
                Label("Web API", systemImage: "globe")
            }
            .buttonStyle(.borderless)
        }
    }

    // MARK: - Logs

    private var logSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Daemon Log")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .textCase(.uppercase)

                Spacer()

                Button(action: manager.refreshLogs) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
            }
            .padding(.horizontal)
            .padding(.top, 8)

            ScrollViewReader { proxy in
                ScrollView {
                    Text(manager.logContents)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(8)
                        .id("logBottom")
                }
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .padding(.horizontal)
                .padding(.bottom)
                .onChange(of: manager.logContents) { _ in
                    proxy.scrollTo("logBottom", anchor: .bottom)
                }
            }
        }
    }
}
