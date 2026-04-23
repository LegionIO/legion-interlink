# Legion Interlink

A native macOS menu bar app that bootstraps, monitors, and controls the LegionIO daemon stack.

## What It Does

Legion Interlink lives in your menu bar (next to WiFi, Bluetooth, etc.) and manages:

- **LegionIO daemon** -- the core async job engine and AI agent runtime
- **Redis** -- in-memory data store for caching and tracing
- **Memcached** -- distributed memory caching
- **Ollama** -- local LLM inference server

On first launch, it automatically starts all services, installs the agentic extension pack (~60 gems), and boots the daemon. After that, it monitors health and gives you one-click control.

## Install

```bash
brew tap legionio/tap
brew install --cask legion-interlink
```

This automatically installs all dependencies (legionio, redis, memcached, ollama).

## Menu Bar

The icon shows a small Legion network grid with a colored status badge:

| Badge | Meaning |
|-------|---------|
| Green | All services healthy |
| Yellow | Some services degraded |
| Orange | First-time setup needed |
| Red | All services stopped |

Click the icon for:
- Service status overview
- Start All / Stop All / Restart Daemon
- Open native dashboard window
- Open web API (localhost:4567)
- Launch at Login toggle

## Dashboard

Click "Open Dashboard" for a native status window with:
- Per-service status cards with individual start/stop controls
- Daemon component readiness (settings, transport, cache, extensions, etc.)
- Live log viewer

## First Launch

On first launch, Legion Interlink detects that setup is needed and runs:

1. `brew services start redis`
2. `brew services start memcached`
3. `brew services start ollama`
4. `legionio setup agentic` (installs the cognitive stack)
5. `legionio update`
6. `brew services start legionio`

Progress is shown in a native onboarding window.

## Development

### Build

```bash
swift build              # debug build
swift build -c release   # release build
```

### Run

```bash
.build/debug/LegionInterlink     # debug
.build/release/LegionInterlink   # release
```

The app appears in your menu bar immediately.

### Project Structure

```
legion-interlink/
  Package.swift                    # Swift package manifest
  Sources/
    LegionInterlinkApp.swift       # @main app, MenuBarExtra, AppDelegate, menu content
    ServiceManager.swift           # Service health polling and control
    OnboardingView.swift           # First-launch setup wizard
    StatusWindow.swift             # Native dashboard window
    Resources/
      icon.icns                    # App icon
  build/
    icon.icns                      # macOS icon (also used in .app bundle)
    icon.png                       # PNG icon
    entitlements.mac.plist         # Code signing entitlements
  scripts/
    generate_icon.swift            # Programmatic icon generator
  .github/workflows/release.yml   # CI: build, sign, notarize, release, update Cask
  VERSION                          # Semver, read by CI
```

### Requirements

- macOS 13.0+ (Ventura)
- Swift 5.9+
- Xcode Command Line Tools

## Architecture

```
Menu Bar Icon (Legion grid + status badge)
  |
  +-- Dropdown Menu
  |     +-- Service status rows (legionio, redis, memcached, ollama)
  |     +-- Start All / Stop All / Restart
  |     +-- Open Dashboard / Open Web API
  |     +-- Launch at Login / Quit
  |
  +-- Dashboard Window (on demand)
  |     +-- Service cards with per-service controls
  |     +-- Daemon component readiness
  |     +-- Log viewer
  |
  +-- Onboarding Window (first launch only)
        +-- brew services start (redis, memcached, ollama)
        +-- legionio setup agentic
        +-- legionio update
        +-- brew services start legionio
```

### Health Checks

| Service | Method | Interval |
|---------|--------|----------|
| LegionIO | `GET http://localhost:4567/api/ready` | 5s |
| Redis | `brew services info redis --json` | 5s |
| Memcached | `brew services info memcached --json` | 5s |
| Ollama | `brew services info ollama --json` | 5s |

## License

MIT
