# Legion Interlink

Native Swift macOS menu bar app — process manager for the LegionIO daemon stack.

## What This Is

A ~600KB SwiftUI app (not Electron) that lives in the menu bar and manages: LegionIO daemon, Redis, Memcached, Ollama. It does NOT provide chat/LLM UI — that's Kai.

## Build & Run

```bash
swift build                       # debug
swift build -c release            # release
./scripts/dev                     # build + run (kills existing instance)
```

No Xcode project — pure Swift Package Manager (`Package.swift`).

## Architecture

- **Single executable target** — all source in `Sources/`, no SPM dependencies
- **macOS 13+, Swift 5.9+**
- **Menu bar only** — `NSApplication.shared.setActivationPolicy(.accessory)`, no Dock icon
- **AppDelegate-driven** — `LegionInterlinkApp` is `@main` but windows are managed by `AppDelegate`

### Key Components

| File | Role |
|------|------|
| `ServiceManager.swift` | Singleton (`ServiceManager.shared`). Health polling, service start/stop, daemon stdout capture. All service control runs in `Task.detached` — never block main thread. |
| `DaemonAPI.swift` | Static HTTP client wrapping `URLSession`. All daemon REST calls go through here. Unwraps `{ "data": ... }` envelope. |
| `DaemonCache.swift` | Lazy-loaded cache for extensions, workers, settings, identity, LLM data. Load-once-then-refresh-on-demand pattern. |
| `StatusWindow.swift` | Dashboard window with tab bar. Also defines `TerminalTheme` (the dark color palette used everywhere). |
| `OnboardingView.swift` | First-launch wizard. Detects setup needed via `~/.legionio/.packs/agentic` marker file. |

### Service Control Flow

```
startService(.legionio)
  → updateServiceStatus(.starting)
  → suppressPolling = true
  → Task.detached:
      stop any existing brew service
      launchDaemonWithStdoutCapture()  ← pipes stdout to logContents + disk file
      waitForServiceReady() loop (polls /api/ready every 1s, up to 60s)
  → updateServiceStatus(.running)
  → suppressPolling = false
```

Infrastructure services (redis, memcached, ollama) use `brew services start/stop`.

### Daemon Interaction

- Health: `GET /api/ready` → `{ data: { ready: bool, components: {} } }`
- Extensions: `GET /api/extension_catalog`
- Workers: `GET /api/workers`
- Settings: `GET /api/settings`
- Identity: `GET /api/identity`
- LLM providers: `GET /api/llm/providers`
- LLM models: `GET /api/llm/models`

All on `localhost:4567`.

### Log Streaming

Two modes:
1. **Live pipe** — when Interlink launched the daemon itself, stdout/stderr is captured via `Process` pipe and streamed to `logContents` in real time.
2. **Tail file** — when the daemon was started externally, tails `~/.legionio/logs/interlink.log` via `/usr/bin/tail -f`.

## Key Patterns

- `@MainActor` for all UI state. `nonisolated` + `Task.detached` for shell/network work.
- `suppressPolling` flag prevents health-check results from overwriting transition states (.starting/.stopping).
- Resolved paths (`resolvedBrewPath`, `resolvedLegionioPath`) computed once at init — no repeated filesystem checks in hot paths.
- `DaemonCache` uses load-once semantics: `loadX(force: false)` is no-op if already loaded. Tabs call this on `.task {}` appear.

## CI

GitHub Actions on `macos-26` runner. Builds universal binary (arm64 + x86_64 via `lipo`), signs, notarizes, creates DMG, pushes GitHub release, updates Homebrew Cask in `LegionIO/homebrew-tap`.

PRs must bump `VERSION` and update `CHANGELOG.md`.

## Rules

- No SPM dependencies — keep the binary small and self-contained.
- All service control must be async and off the main thread.
- Never block the UI — all `Process` execution happens in `Task.detached` or `nonisolated` methods.
- The app must survive daemon being unreachable — all API calls handle connection-refused gracefully.
- Menu bar icon must always reflect current `OverallStatus` (polled every 1s via Timer).
