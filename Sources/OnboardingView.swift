import SwiftUI

// MARK: - Onboarding Step Model

enum OnboardingStepStatus {
    case pending
    case running
    case succeeded
    case failed
}

struct OnboardingStep: Identifiable {
    let id: String
    let title: String
    let description: String
    var status: OnboardingStepStatus = .pending
    var output: String = ""
}

// MARK: - OnboardingView

struct OnboardingView: View {
    @EnvironmentObject var manager: ServiceManager
    let onComplete: () -> Void

    @State private var steps: [OnboardingStep] = [
        OnboardingStep(
            id: "redis",
            title: "Start Redis",
            description: "In-memory data store for caching and tracing"
        ),
        OnboardingStep(
            id: "memcached",
            title: "Start Memcached",
            description: "Distributed memory caching system"
        ),
        OnboardingStep(
            id: "ollama",
            title: "Start Ollama",
            description: "Local LLM inference server"
        ),
        OnboardingStep(
            id: "agentic",
            title: "Install Agentic Pack",
            description: "Cognitive stack: ~60 gems for AI reasoning, memory, and coordination"
        ),
        OnboardingStep(
            id: "update",
            title: "Update Legion",
            description: "Update all installed Legion gems to latest versions"
        ),
        OnboardingStep(
            id: "daemon",
            title: "Start LegionIO Daemon",
            description: "Boot the daemon with all extensions"
        ),
    ]

    @State private var isRunning = false
    @State private var isDone = false
    @State private var currentOutput: String = ""

    private var completedCount: Int {
        steps.filter { $0.status == .succeeded }.count
    }

    private var progress: Double {
        guard !steps.isEmpty else { return 0 }
        return Double(completedCount) / Double(steps.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            headerSection
            Divider()
            stepListSection
            Divider()
            outputSection
            Divider()
            footerSection
        }
        .frame(minWidth: 500, minHeight: 450)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 36))
                .foregroundStyle(.purple)

            Text("Welcome to Legion Interlink")
                .font(.title2.bold())

            Text("Setting up your LegionIO environment")
                .font(.subheadline)
                .foregroundColor(.secondary)

            ProgressView(value: progress)
                .progressViewStyle(.linear)
                .padding(.horizontal)
        }
        .padding()
    }

    // MARK: - Step List

    private var stepListSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(steps) { step in
                    HStack(spacing: 10) {
                        stepIcon(step.status)
                            .frame(width: 20)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(step.title)
                                .font(.body.weight(step.status == .running ? .semibold : .regular))
                            Text(step.description)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 4)
                    .background(step.status == .running ? Color.accentColor.opacity(0.05) : Color.clear)
                    .cornerRadius(6)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
        }
        .frame(maxHeight: 220)
    }

    @ViewBuilder
    private func stepIcon(_ status: OnboardingStepStatus) -> some View {
        switch status {
        case .pending:
            Image(systemName: "circle")
                .foregroundColor(.secondary)
        case .running:
            ProgressView()
                .controlSize(.small)
        case .succeeded:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .foregroundColor(.red)
        }
    }

    // MARK: - Output

    private var outputSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Output")
                .font(.caption)
                .foregroundColor(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal)
                .padding(.top, 6)

            ScrollViewReader { proxy in
                ScrollView {
                    Text(currentOutput.isEmpty ? "Ready to begin setup..." : currentOutput)
                        .font(.system(.caption2, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(6)
                        .id("outputBottom")
                }
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .padding(.horizontal)
                .padding(.bottom, 8)
                .frame(maxHeight: 120)
                .onChange(of: currentOutput) { _ in
                    proxy.scrollTo("outputBottom", anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Footer

    private var footerSection: some View {
        HStack {
            if isDone {
                Text("Setup complete!")
                    .foregroundColor(.green)
                    .font(.subheadline.bold())
            } else if steps.contains(where: { $0.status == .failed }) {
                Text("Setup encountered errors. You can retry or continue.")
                    .foregroundColor(.orange)
                    .font(.caption)
            }

            Spacer()

            if isDone {
                Button("Done") {
                    manager.checkSetupNeeded()
                    Task { await manager.checkAllServices() }
                    onComplete()
                }
                .buttonStyle(.borderedProminent)
            } else {
                Button("Begin Setup") {
                    Task { await runSetup() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isRunning)
            }
        }
        .padding()
    }

    // MARK: - Setup Execution

    @MainActor
    private func runSetup() async {
        isRunning = true
        currentOutput = ""

        let brewPath = FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/brew")
            ? "/opt/homebrew/bin/brew"
            : "/usr/local/bin/brew"

        let legionioPath = FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/legionio")
            ? "/opt/homebrew/bin/legionio"
            : "/usr/local/bin/legionio"

        // Step 1-3: Start brew services
        for serviceName in ["redis", "memcached", "ollama"] {
            setStepStatus(serviceName, .running)
            appendOutput("Starting \(serviceName)...\n")

            let (output, success) = await manager.runCommand(brewPath, arguments: ["services", "start", serviceName])
            appendOutput(output)

            setStepStatus(serviceName, success ? .succeeded : .failed)
            if !success {
                appendOutput("Warning: \(serviceName) failed to start, continuing...\n")
            }
        }

        // Step 4: legionio setup agentic
        setStepStatus("agentic", .running)
        appendOutput("\nInstalling agentic pack (this may take a few minutes)...\n")

        let agenticSuccess = await manager.runCommandStreaming(
            legionioPath,
            arguments: ["setup", "agentic"]
        ) { line in
            Task { @MainActor in
                self.appendOutput(line)
            }
        }
        setStepStatus("agentic", agenticSuccess ? .succeeded : .failed)

        // Step 5: legionio update
        setStepStatus("update", .running)
        appendOutput("\nUpdating Legion gems...\n")

        let updateSuccess = await manager.runCommandStreaming(
            legionioPath,
            arguments: ["update"]
        ) { line in
            Task { @MainActor in
                self.appendOutput(line)
            }
        }
        setStepStatus("update", updateSuccess ? .succeeded : .failed)

        // Step 6: Start daemon
        setStepStatus("daemon", .running)
        appendOutput("\nStarting LegionIO daemon...\n")

        let (daemonOutput, daemonSuccess) = await manager.runCommand(
            brewPath,
            arguments: ["services", "start", "legionio"]
        )
        appendOutput(daemonOutput)
        setStepStatus("daemon", daemonSuccess ? .succeeded : .failed)

        // Refresh service states
        await manager.checkAllServices()
        manager.checkSetupNeeded()

        appendOutput("\nSetup complete.\n")
        isDone = true
        isRunning = false
    }

    private func setStepStatus(_ id: String, _ status: OnboardingStepStatus) {
        if let idx = steps.firstIndex(where: { $0.id == id }) {
            steps[idx].status = status
        }
    }

    private func appendOutput(_ text: String) {
        currentOutput += text
    }
}
