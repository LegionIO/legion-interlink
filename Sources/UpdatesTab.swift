import SwiftUI

struct UpdatesTab: View {
    @StateObject private var updateManager = UpdateManager.shared

    var body: some View {
        VStack(spacing: 0) {
            header

            if updateManager.isChecking && !updateManager.hasChecked {
                LLMTabHelpers.loadingView
            } else if let error = updateManager.checkError {
                LLMTabHelpers.errorView(error) { Task { await updateManager.checkForUpdates(force: true) } }
            } else if updateManager.items.isEmpty && updateManager.hasChecked {
                upToDateView
            } else if !updateManager.items.isEmpty {
                updatesList
            } else {
                notCheckedView
            }
        }
        .background(TerminalTheme.bg)
        .task { await updateManager.checkForUpdates() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("UPDATES")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            if updateManager.outdatedCount > 0 {
                Text("\(updateManager.outdatedCount)")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.yellow)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(TerminalTheme.yellow.opacity(0.1))
                    .cornerRadius(3)
            }

            Spacer()

            if updateManager.isChecking {
                ProgressView()
                    .controlSize(.mini)
                    .scaleEffect(0.7)
            }

            Toggle(isOn: $updateManager.autoUpdateLex) {
                Text("auto-update lex")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim)
            }
            .toggleStyle(TerminalCheckboxStyle())

            if updateManager.outdatedCount > 0 {
                updateAllButton
            }

            checkButton
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

    private var checkButton: some View {
        Button(action: { Task { await updateManager.checkForUpdates(force: true) } }) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10))
                Text("check")
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
        .pointerCursor()
        .disabled(updateManager.isChecking)
        .opacity(updateManager.isChecking ? 0.5 : 1)
    }

    private var updateAllButton: some View {
        Button(action: { updateManager.updateAll() }) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 10))
                Text("update all")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
            }
            .foregroundColor(TerminalTheme.green)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(TerminalTheme.green.opacity(0.1))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(TerminalTheme.green.opacity(0.2), lineWidth: 1)
            )
            .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .disabled(updateManager.anyUpdating)
        .opacity(updateManager.anyUpdating ? 0.5 : 1)
    }

    // MARK: - Updates List

    private var updatesList: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Brew section
                let brewItems = updateManager.items.filter { $0.source == .brew }
                if !brewItems.isEmpty {
                    sectionHeader("HOMEBREW", icon: "mug")
                    ForEach(brewItems) { item in
                        updateCard(item)
                    }
                }

                // Gem section
                let gemItems = updateManager.items.filter { $0.source == .gem }
                if !gemItems.isEmpty {
                    sectionHeader("GEMS (legion-gem)", icon: "shippingbox")
                    ForEach(gemItems) { item in
                        updateCard(item)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private func sectionHeader(_ title: String, icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundColor(TerminalTheme.textDim.opacity(0.6))
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.6))
            Spacer()
        }
        .padding(.top, 8)
        .padding(.bottom, 2)
    }

    private func updateCard(_ item: UpdateItem) -> some View {
        HoverCard {
            HStack(spacing: 12) {
                Circle()
                    .fill(TerminalTheme.yellow)
                    .frame(width: 7, height: 7)
                    .shadow(color: TerminalTheme.yellow.opacity(0.5), radius: 3)

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(TerminalTheme.text)

                    HStack(spacing: 6) {
                        Text(item.currentVersion)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(TerminalTheme.textDim)

                        Image(systemName: "arrow.right")
                            .font(.system(size: 8))
                            .foregroundColor(TerminalTheme.green)

                        Text(item.availableVersion)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(TerminalTheme.green)
                    }
                }

                Spacer()

                if item.source == .brew {
                    Text("brew")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(TerminalTheme.surfaceBg)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(TerminalTheme.border, lineWidth: 1))
                        .cornerRadius(3)
                }

                if item.isUpdating {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.7)
                } else {
                    Button(action: { updateManager.updateItem(item) }) {
                        Text("update")
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(TerminalTheme.green)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            .background(TerminalTheme.green.opacity(0.1))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(TerminalTheme.green.opacity(0.3), lineWidth: 1)
                            )
                            .cornerRadius(4)
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()
                }
            }
            .padding(12)
        }
    }

    // MARK: - Empty States

    private var upToDateView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "checkmark.circle")
                .font(.system(size: 32))
                .foregroundColor(TerminalTheme.green.opacity(0.6))
            Text("Everything is up to date")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
            if let lastChecked = updateManager.lastChecked {
                Text("Checked \(lastChecked, style: .relative) ago")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var notCheckedView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.3))
            Text("Check for updates")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
            Text("Checks legionio (brew) and legion-*/lex-* gems")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.4))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
