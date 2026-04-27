import SwiftUI
import AppKit

// MARK: - Daemon Settings Tab

struct DaemonSettingsTab: View {
    @StateObject private var cache = DaemonCache.shared
    @State private var searchText = ""
    @State private var selectedSection: String?

    /// The currently-selected section object (if any).
    private var activeSection: CachedSettingsSection? {
        cache.settings.first(where: { $0.id == selectedSection })
    }

    /// Sidebar sections filtered by search text.
    private var filteredSections: [CachedSettingsSection] {
        if searchText.isEmpty { return cache.settings }
        let q = searchText.lowercased()
        return cache.settings.filter { section in
            section.id.lowercased().contains(q) ||
            section.fields.contains(where: {
                $0.label.lowercased().contains(q) ||
                $0.value.lowercased().contains(q)
            })
        }
    }

    /// Fields for the active section filtered by search text.
    private var filteredFields: [CachedSettingField] {
        guard let section = activeSection else { return [] }
        if searchText.isEmpty { return section.fields }
        let q = searchText.lowercased()
        // If the section name itself matches, show all fields
        if section.id.lowercased().contains(q) { return section.fields }
        return section.fields.filter {
            $0.label.lowercased().contains(q) ||
            $0.value.lowercased().contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if cache.settingsLoading && !cache.settingsLoaded {
                loadingView
            } else if let error = cache.settingsError {
                errorView(error)
            } else if cache.settings.isEmpty {
                emptyView
            } else {
                header
                splitPane
            }
        }
        .background(TerminalTheme.bg)
        .task {
            await cache.loadSettings()
            // Auto-select the first section if nothing selected
            if selectedSection == nil, let first = cache.settings.first {
                selectedSection = first.id
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "gearshape")
                .font(.system(size: 11))
                .foregroundColor(TerminalTheme.accent)

            Text("SETTINGS")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)

            Spacer()

            // Search
            TerminalSearchBox(text: $searchText)

            Button(action: {
                Task {
                    await cache.loadSettings(force: true)
                    if selectedSection == nil, let first = cache.settings.first {
                        selectedSection = first.id
                    }
                }
            }) {
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
    }

    // MARK: - Split Pane

    private var splitPane: some View {
        HStack(spacing: 0) {
            sidebar
            divider
            contentPanel
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        VStack(spacing: 0) {
            // Section list
            ScrollView {
                LazyVStack(spacing: 1) {
                    ForEach(filteredSections) { section in
                        sidebarRow(section)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .frame(width: 180)
        .background(TerminalTheme.surfaceBg.opacity(0.5))
    }

    private func sidebarRow(_ section: CachedSettingsSection) -> some View {
        let isSelected = selectedSection == section.id

        return Button(action: { selectedSection = section.id }) {
            HStack(spacing: 8) {
                Image(systemName: iconForSection(section.id))
                    .font(.system(size: 10))
                    .foregroundColor(isSelected ? TerminalTheme.accent : TerminalTheme.textDim.opacity(0.6))
                    .frame(width: 14)

                Text(section.id.replacingOccurrences(of: "_", with: " "))
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular, design: .monospaced))
                    .foregroundColor(isSelected ? TerminalTheme.text : TerminalTheme.textDim)
                    .lineLimit(1)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundColor(isSelected ? TerminalTheme.accent.opacity(0.5) : TerminalTheme.textDim.opacity(0.2))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
            .background(
                isSelected
                    ? TerminalTheme.accent.opacity(0.08)
                    : Color.clear
            )
            .overlay(
                Rectangle()
                    .fill(isSelected ? TerminalTheme.accent : Color.clear)
                    .frame(width: 2),
                alignment: .leading
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    private var divider: some View {
        Rectangle()
            .fill(TerminalTheme.border)
            .frame(width: 1)
    }

    // MARK: - Content Panel

    private var contentPanel: some View {
        Group {
            if let section = activeSection {
                VStack(spacing: 0) {
                    contentHeader(section)
                    contentBody(section)
                }
            } else {
                noSelectionView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func contentHeader(_ section: CachedSettingsSection) -> some View {
        HStack(spacing: 10) {
            Image(systemName: iconForSection(section.id))
                .font(.system(size: 12))
                .foregroundColor(TerminalTheme.accent)

            VStack(alignment: .leading, spacing: 1) {
                Text(section.id.replacingOccurrences(of: "_", with: " ").uppercased())
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(TerminalTheme.text)

                Text(section.filename)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            }

            Spacer()

            Text("\(section.fields.count) field\(section.fields.count == 1 ? "" : "s")")
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.5))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(TerminalTheme.bg.opacity(0.5))
                .cornerRadius(3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(TerminalTheme.surfaceBg)
        .overlay(
            Rectangle()
                .fill(TerminalTheme.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func contentBody(_ section: CachedSettingsSection) -> some View {
        let fields = filteredFields

        return ScrollView {
            if fields.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 18))
                        .foregroundColor(TerminalTheme.textDim.opacity(0.3))
                    Text("No matching fields")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(TerminalTheme.textDim)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
            } else {
                LazyVStack(spacing: 2) {
                    ForEach(fields) { field in
                        fieldRow(field, sectionKey: section.id)
                    }
                }
                .padding(12)
            }
        }
    }

    // MARK: - Field Row

    private func fieldRow(_ field: CachedSettingField, sectionKey: String) -> some View {
        // Strip the section prefix from the label for cleaner display
        let displayLabel: String = {
            let prefix = sectionKey + "."
            if field.label.hasPrefix(prefix) {
                return String(field.label.dropFirst(prefix.count))
            }
            return field.label
        }()

        return HStack(spacing: 0) {
            Text(displayLabel)
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent.opacity(0.85))
                .frame(minWidth: 100, maxWidth: 180, alignment: .trailing)
                .lineLimit(1)
                .truncationMode(.middle)
                .padding(.trailing, 12)

            Text(field.value)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.text)
                .textSelection(.enabled)
                .lineLimit(nil)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(TerminalTheme.bg.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(TerminalTheme.border, lineWidth: 1)
                )
                .cornerRadius(3)
        }
        .padding(.vertical, 3)
    }

    // MARK: - No Selection Placeholder

    private var noSelectionView: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "sidebar.left")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.2))
            Text("Select a category")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.4))
            Text("Choose a settings section from the sidebar")
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.25))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Section Icons

    private func iconForSection(_ section: String) -> String {
        switch section {
        case "cache":                  return "memorychip"
        case "cache_local":            return "internaldrive"
        case "transport":              return "network"
        case "data":                   return "cylinder"
        case "identity":               return "person.crop.circle"
        case "llm":                    return "brain"
        case "crypt":                  return "lock.shield"
        case "rbac":                   return "person.badge.shield.checkmark"
        case "credentials":            return "key"
        case "gaia":                   return "bubble.left.and.bubble.right"
        case "microsoft_teams":        return "message"
        case "desktop":                return "desktopcomputer"
        default:                       return "doc.text"
        }
    }

    // MARK: - Loading / Empty / Error

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .controlSize(.small)
                .tint(TerminalTheme.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "gearshape")
                .font(.system(size: 28))
                .foregroundColor(TerminalTheme.textDim.opacity(0.3))
            Text("No settings found")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim)
            Text("Check ~/.legionio/settings/ and daemon status")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(TerminalTheme.textDim.opacity(0.5))
            Button("Retry") { Task { await cache.loadSettings(force: true) } }
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent)
                .pointerCursor()
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
            Button("Retry") { Task { await cache.loadSettings(force: true) } }
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(TerminalTheme.accent)
                .pointerCursor()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
