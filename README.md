# Legion Interlink

Native macOS menu bar app that bootstraps, monitors, and controls the LegionIO daemon stack.

## What It Does

Legion Interlink lives in your menu bar and manages:

- **LegionIO daemon** — core async job engine and AI agent runtime
- **Redis** — in-memory data store for caching and tracing
- **Memcached** — distributed memory caching
- **Ollama** — local LLM inference server

On first launch it starts all services, installs the agentic extension pack (~60 gems), and boots the daemon. After that it monitors health and gives you one-click control.

## Install

```bash
brew tap legionio/tap
brew install --cask legion-interlink
```

Dependencies (legionio, redis, memcached, ollama) are installed automatically.

## Menu Bar

The icon shows a Legion network grid with a colored status badge:

| Badge  | Meaning              |
|--------|----------------------|
| Green  | Daemon online        |
| Orange | First-time setup     |
| Red    | Daemon offline       |
| Gray   | Checking...          |

- **Left-click** opens the dashboard window.
- **Right-click** opens a context menu (status, Open Dashboard, Launch at Login, Quit).

## Dashboard

A native window with eleven tabs:

| Tab        | Shows                                                        |
|------------|--------------------------------------------------------------|
| Services   | Per-service cards with start/stop, daemon component readiness |
| Logs       | Live daemon log viewer with auto-scroll and clear            |
| Identity   | Current session identity and auth provider status            |
| LLM        | LLM configuration and model routing settings                 |
| Providers  | Registered LLM providers with model details                  |
| GAIA       | Cognitive coordination engine status                         |
| MCP        | Model Context Protocol server connections                    |
| Extensions | Installed/running LEX extensions with install/uninstall      |
| Workers    | Active worker actors with task counts                        |
| Updates    | Gem version checker with auto-update for lex-* extensions    |
| Settings   | Daemon settings browser (read from `~/.legionio/settings/`)  |

## First Launch (Onboarding)

When `~/.legionio/.packs/agentic` is absent, Interlink shows a setup wizard that runs:

1. `brew services start redis`
2. `brew services start memcached`
3. `brew services start ollama`
4. `legionio setup agentic`
5. `legionio update`
6. `legionio start`

Progress and output stream in real time.

## Health Checks

| Service    | Method                                      | Interval |
|------------|---------------------------------------------|----------|
| LegionIO   | `GET http://localhost:4567/api/ready`        | 5s       |
| Redis      | `brew services info redis --json`            | 5s       |
| Memcached  | `brew services info memcached --json`        | 5s       |
| Ollama     | `brew services info ollama --json`           | 5s       |

## Notifications

Legion Interlink sends macOS notifications for:

- **External state changes** — when a service starts or stops outside of Interlink (e.g. via `brew services` CLI or a crash). Actions triggered from within the Interlink UI do not fire notifications.
- **Updates available** — when new versions of legionio or core libraries are detected.
- **Upgrade relaunch** — when a `brew upgrade` installs a newer binary and Interlink restarts itself.

## Development

### Build & Run

```bash
./scripts/dev              # build debug + run
./scripts/dev release      # build release + run
./scripts/dev build        # build debug only
./scripts/dev clean        # rm -rf .build
```

Or manually:

```bash
swift build
.build/debug/LegionInterlink
```

### Requirements

- macOS 13.0+ (Ventura)
- Swift 5.9+
- Xcode Command Line Tools

### Project Structure

```
Package.swift                     Swift package manifest (macOS 13, single executable target)
VERSION                           Semver — read by CI
Sources/
  LegionInterlinkApp.swift        @main, AppDelegate, menu bar icon, window management
  ServiceManager.swift            Service lifecycle, health polling, daemon process streaming
  DaemonAPI.swift                 HTTP client for daemon REST API
  DaemonCache.swift               Cached models + lazy-loaded data for dashboard tabs
  StatusWindow.swift              Dashboard window: tab bar, services tab, logs tab, theme
  OnboardingView.swift            First-launch setup wizard
  ExtensionsTab.swift             Extensions tab
  WorkersTab.swift                Workers tab
  LLMTab.swift                    Identity tab, LLM providers/models tab, shared UI helpers
  DaemonSettingsTab.swift         Settings browser (sidebar + content split pane)
  TerminalTextField.swift         Reusable search box component
  PointerCursor.swift             Pointer cursor view modifier
  Resources/icon.icns             App icon
scripts/
  dev                             Dev helper (build/run/clean)
  generate_icon.swift             Programmatic icon generator
.github/workflows/release.yml    CI: build universal binary, sign, notarize, release, update Cask
```

## CI/CD

On push to `main`:
1. Builds universal binary (arm64 + x86_64)
2. Packages `.app` bundle with `Info.plist` (LSUIElement = true)
3. Code signs with Developer ID certificate
4. Notarizes with Apple
5. Creates DMG and GitHub release
6. Updates `LegionIO/homebrew-tap` Cask formula

PRs run `swift build` and enforce VERSION + CHANGELOG bumps.

## Relationship to Kai

Chat and AI assistant functionality lives in **Kai** (`brew install --cask legionio/tap/kai`). Kai connects to the same daemon stack via `kai-plugin-legion`. Legion Interlink exists solely to manage the daemon services that Kai and other tools consume.

## License

MIT
