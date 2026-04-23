import SwiftUI

// MARK: - Task Model

private struct TaskItem: Identifiable {
    let id: String
    let status: String       // "completed", "running", "failed", "pending"
    let runnerClass: String
    let function: String
    let createdAt: String
}

// MARK: - Tasks Tab

struct TasksTab: View {
    @State private var tasks: [TaskItem] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var expandedId: String?
    @State private var taskLogs: [String: String] = [:]
    @State private var loadingLogs: Set<String> = []

    var body: some View {
        VStack(spacing: 0) {
            header

            if isLoading {
                Spacer()
                ProgressView()
                    .controlSize(.small)
                    .tint(TerminalTheme.accent)
                Spacer()
            } else if let error = errorMessage {
                errorView(error)
            } else if tasks.isEmpty {
                emptyView
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(tasks) { task in
                            taskRow(task)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .background(TerminalTheme.bg)
        .task { await loadTasks() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "list.bullet.clipboard")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("TASKS")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if !tasks.isEmpty {
                Text("\(tasks.count)")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(TerminalTheme.accent.opacity(0.1))
                    .cornerRadius(3)
            }

            Spacer()

            Button(action: { Task { await loadTasks() } }) {
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

    // MARK: - Task Row

    private func taskRow(_ task: TaskItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main row
            Button(action: {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedId == task.id {
                        expandedId = nil
                    } else {
                        expandedId = task.id
                        if taskLogs[task.id] == nil {
                            Task { await loadLogs(for: task) }
                        }
                    }
                }
            }) {
                HStack(spacing: 10) {
                    // Status indicator
                    Circle()
                        .fill(statusColor(task.status))
                        .frame(width: 7, height: 7)
                        .shadow(color: statusColor(task.status).opacity(0.5), radius: 3)

                    // Task ID (truncated)
                    Text(truncateId(task.id))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(TerminalTheme.accent.opacity(0.8))
                        .frame(width: 70, alignment: .leading)

                    // Status
                    Text(task.status)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(statusColor(task.status))
                        .frame(width: 65, alignment: .leading)

                    // Runner class
                    Text(task.runnerClass)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)
                        .lineLimit(1)

                    Spacer()

                    // Function
                    if !task.function.isEmpty {
                        Text(task.function)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(TerminalTheme.textDim)
                            .lineLimit(1)
                    }

                    // Created
                    Text(task.createdAt)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim.opacity(0.6))

                    // Expand chevron
                    Image(systemName: expandedId == task.id ? "chevron.down" : "chevron.right")
                        .font(.system(size: 8))
                        .foregroundColor(TerminalTheme.textDim)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)

            // Expanded: logs
            if expandedId == task.id {
                Rectangle()
                    .fill(TerminalTheme.border)
                    .frame(height: 1)
                    .padding(.horizontal, 10)

                if loadingLogs.contains(task.id) {
                    HStack {
                        Spacer()
                        ProgressView()
                            .controlSize(.mini)
                            .scaleEffect(0.7)
                        Spacer()
                    }
                    .padding(8)
                } else if let logs = taskLogs[task.id] {
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(logs.isEmpty ? "No logs available" : logs)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(logs.isEmpty ? TerminalTheme.textDim : TerminalTheme.green.opacity(0.8))
                            .textSelection(.enabled)
                            .padding(10)
                    }
                    .frame(maxHeight: 150)
                    .background(TerminalTheme.bg.opacity(0.5))
                }
            }
        }
        .background(TerminalTheme.cardBg)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(TerminalTheme.border, lineWidth: 1)
        )
        .cornerRadius(6)
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "completed", "complete", "success": return TerminalTheme.green
        case "running", "in_progress", "active":  return TerminalTheme.yellow
        case "failed", "error":                    return TerminalTheme.red
        case "pending", "queued":                  return TerminalTheme.gray
        default:                                   return TerminalTheme.gray
        }
    }

    private func truncateId(_ id: String) -> String {
        if id.count > 8 { return String(id.prefix(8)) + "..." }
        return id
    }

    // MARK: - Empty / Error

    private var emptyView: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "list.bullet.clipboard")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.3))
            Text("No tasks found")
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
            Button("Retry") { Task { await loadTasks() } }
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - API

    private func loadTasks() async {
        isLoading = true
        errorMessage = nil

        let result = await DaemonAPI.get("/api/tasks")
        await MainActor.run {
            if result.ok, let items = result.data as? [[String: Any]] {
                tasks = items.compactMap { parseTask($0) }
            } else if !result.ok {
                errorMessage = "Failed to load tasks — is the daemon running?"
            } else {
                tasks = []
            }
            isLoading = false
        }
    }

    private func loadLogs(for task: TaskItem) async {
        _ = await MainActor.run { loadingLogs.insert(task.id) }
        let result = await DaemonAPI.get("/api/tasks/\(task.id)/logs")
        await MainActor.run {
            if result.ok {
                if let logStr = result.data as? String {
                    taskLogs[task.id] = logStr
                } else if let logArr = result.data as? [[String: Any]] {
                    let lines = logArr.compactMap { entry -> String? in
                        let ts = entry["timestamp"] as? String ?? ""
                        let msg = entry["message"] as? String ?? entry["line"] as? String ?? ""
                        return ts.isEmpty ? msg : "[\(ts)] \(msg)"
                    }
                    taskLogs[task.id] = lines.joined(separator: "\n")
                } else if let dict = result.data as? [String: Any],
                          let logStr = dict["logs"] as? String {
                    taskLogs[task.id] = logStr
                } else {
                    taskLogs[task.id] = ""
                }
            } else {
                taskLogs[task.id] = "[error] Failed to load logs"
            }
            loadingLogs.remove(task.id)
        }
    }

    private func parseTask(_ dict: [String: Any]) -> TaskItem? {
        let id = dict["id"] as? String ?? dict["taskId"] as? String ?? UUID().uuidString
        let status = dict["status"] as? String ?? dict["state"] as? String ?? "unknown"
        let runnerClass = dict["runner_class"] as? String ?? dict["runnerClass"] as? String ?? dict["runner"] as? String ?? "—"
        let function = dict["function"] as? String ?? dict["method"] as? String ?? ""
        let createdAt = dict["created_at"] as? String ?? dict["createdAt"] as? String ?? ""
        return TaskItem(id: id, status: status, runnerClass: runnerClass, function: function, createdAt: createdAt)
    }
}
