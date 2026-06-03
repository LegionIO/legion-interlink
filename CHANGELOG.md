# Changelog

## [2.3.3] - 2026-06-02

### Changed
- **Codex routing is profile-based** — Interlink now only toggles `profile = "legionio"` in `~/.codex/config.toml` rather than injecting an inline provider block. Full provider config is owned by `legionio setup proxy-mode`. Removes backup/restore cycle for Codex; the profile line is simply added or removed.
- **Native button is now cyan** — The "native" side of the routing toggle uses cyan (`#40D1E0`) when selected, matching the same filled-with-dark-text pattern as the LegionIO/accent side. Border also turns cyan when native is active. Previously the native selection was nearly invisible against the dark background.
- **Codex routing state reads config.toml directly** — Toggle reflects actual file state on load; `legionio setup proxy-mode` and Interlink stay in sync automatically.
- **Claude routing is explicitly bidirectional** — Both directions write the full state: enabling LegionIO injects all proxy env vars + `model = legionio`; switching back to native strips exactly those keys from `settings.json`, leaving MCP servers, hooks, and all other config untouched. No backup file created or needed.
- **Claude settings.json env vars aligned with setup proxy-mode** — `ANTHROPIC_BASE_URL` now points to `http://localhost:4567` (no path suffix), `ANTHROPIC_API_KEY = "legion"`, `ANTHROPIC_AUTH_TOKEN = ""`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"`, `CLAUDE_CODE_USE_BEDROCK / AWS_PROFILE / AWS_REGION` cleared, `ANTHROPIC_DEFAULT_*_MODEL` vars removed.

### Fixed
- **Daemon status when running via `bundle exec`** — Interlink previously required brew services to confirm the daemon was running, so manually launched daemons (`bundle exec exe/legionio start`) showed as OFFLINE even with a live API. Now the HTTP health check (`/api/ready`) is authoritative: if the endpoint responds, the daemon is online regardless of brew's knowledge of the process.

## [2.3.2] - 2026-05-29

### Fixed
- **Kai routing patches correct config file** — Replaced `~/.kai/config.toml` approach (not read by Kai Desktop) with `~/.kai/settings/desktop.json` + `~/.kai/settings/llm.json`. The patch sets `agent.runtime = "legionio"`, registers the `legionio` openai-compatible provider at `http://127.0.0.1:4567/api/llm/inference/v1`, upserts the `legionio` model catalog entry with `provider: "legionio"` (removing any stale entry from prior plugin installs), and sets `defaultModelKey = "legionio"`. Also patches `llm.json` `default_model` / `default_provider` so Kai's config loader resolves the correct model. Both files are backed up before patching and fully restored on toggle-off.

## [2.3.1] - 2026-05-29

### Added
- **Kai routing toggle** — Kai client card with per-client LegionIO ↔ native routing toggle, matching Claude Code and Codex. Patches `~/.kai/config.toml` with LegionIO provider config when routing is enabled.
- **Per-client config restore** — All three clients (Claude, Codex, Kai) now properly restore their original config files when toggled back to "native" mode. Backup/restore cycle works cleanly: enable routes through LegionIO, disable restores originals.

### Fixed
- **Task.detached ambiguity** — Added explicit `priority: .utility` to all detached tasks for Swift 6 strict concurrency compatibility.
- **Kai routing state persistence** — Kai routing state is now saved and loaded from `~/.legionio/settings/interlink.json` alongside Claude and Codex.

## [2.3.0] - 2026-05-28

### Added
- **Clients tab** — New first tab listing Claude Code, Codex, and Kai with install status, per-client LegionIO ↔ native routing toggle, and one-click open buttons. Claude Code launches a new Terminal window with `claude` pre-typed. Codex and Kai open as desktop apps.
- **ClientConfigManager** — Patches `~/.claude/settings.json` (`env.ANTHROPIC_BASE_URL`) and `~/.codex/config.toml` (`[model_providers.legionio]`) when routing is enabled per-client. Backs up originals and restores on toggle-off. All file I/O is off the main thread.
- **Kai removed from Services tab** — Kai is now exclusively managed from the Clients tab.

### Changed
- **Routing is manual** — Config patching is driven by per-client toggles only; no auto-patch on daemon online/offline transitions.
- **Clients tab is the default landing screen** — Swapped order so Clients appears before Services.
- **Sendable warning fix** — `@preconcurrency import UserNotifications` in `UpdateManager.swift`.

## [2.2.9] - 2026-05-27

### Fixed
- **Idle CPU reduced from ~18% to near-zero** — Replaced 4 separate `brew services info` subprocess spawns (every 5s) with a single `brew services list --json` call. Polling interval now adapts: 10s when the dashboard window is focused, 60s when backgrounded or closed.
- **Menu bar icon no longer polls every 1s** — Replaced `Timer` with Combine subscription that only updates the icon when overall status actually changes.
- **Animations pause when window is unfocused** — `BreathingStatusPill`, `PulsingDot`, and `PulsingStatusText` all stop their infinite animations when the window loses key status, eliminating continuous Metal/GPU compositing behind other apps.

## [2.2.8] - 2026-05-26

### Added
- **External state change notifications** — macOS notifications fire when a service starts or stops outside of Interlink (e.g. via `brew services` CLI or a crash). Actions triggered from within the Interlink UI do not produce notifications.

### Changed
- **README updated** — Dashboard tabs table expanded from 7 to 11 reflecting current UI (Providers, GAIA, MCP, Updates). Added Notifications section.
- **CLAUDE.md rules** — Codified `legion-gem`-only rule and notification behavior for future contributors.

## [2.2.7] - 2026-05-26

### Fixed
- **Window not showing on click** — Removed `hidesOnDeactivate` and `.floating` window level that caused a race condition where clicking the menu bar icon would deactivate and hide the window before the click handler could show it.

### Added
- **Auto-relaunch after brew upgrade** — When the user clicks the menu bar icon and the on-disk version (from Homebrew Cellar) differs from the running version, the app posts a macOS notification and relaunches itself. Zero background polling — only checks on interaction.

## [2.2.6] - 2026-05-26

### Added
- **Installed gems detection** — Extensions tab runs `legion-gem list` (cached, refreshed on demand) to show which lex-* gems are installed locally, separate from what the daemon reports as running.
- **Three-section extensions layout** — Running (live in daemon), Installed (on disk but not running), and Available (not yet installed).
- **Core dependency badge** — Gems matching `lex-agentic-*`, `lex-llm*`, `lex-identity-*` display a "core" badge and cannot be uninstalled.
- **Installed + running counts** — Header shows both "X installed" and "Y running" badges.

### Changed
- **Default window size** — Increased from 700x550 to 900x600 for better content visibility across all tabs.
- **Window frame persistence** — Size and position saved to UserDefaults on resize/move/close, restored on next open.
- **Dismiss on focus loss** — _Reverted in 2.2.7_ (caused window to not show on click).

## [2.2.5] - 2026-05-25

### Fixed
- **Log view 100% CPU after extended uptime** — Replaced single monolithic `Text` view with virtualized `LazyVStack` of individual log lines. The previous implementation rendered the entire log buffer as one attributed string on every update, causing CoreText to loop indefinitely encoding glyphs once the buffer grew large. (#74)
- **Dashboard disappears when clicking another window** — Window now stays at `.floating` level so it remains on top like a menu bar popover.

### Added
- **Log level coloring** — Lines colored by severity: debug (light blue), info (green), warn (yellow), error (red), fatal (dark red). Parses both Ruby Logger and structured log formats.
- **Extension catalog** — Extensions tab now shows available extensions organized into categories (Extensions, Extension Skills, Setup Packs) with install buttons that run `legion-gem install` or `legionio setup`.
- **Line count indicator** — Logs toolbar shows current buffer line count.

### Changed
- **Updates use `legion-gem outdated` only** — Eliminated periodic `brew outdated` polling. Update detection is now gem-based; `brew upgrade` is only called when actually upgrading the legionio CLI binary.
- **Updates tab reorganized** — Sections are now Core (legionio + legion-*), Extensions (lex-*), and Other.

### Performance
- **Log buffer is now an array of stable-ID lines** — Appending new log entries and trimming old ones no longer requires splitting/rejoining the entire string. The `LazyVStack` only renders lines visible in the scroll viewport.
- **Reduced log buffer cap** — Max retained lines reduced from 4,000 to 2,000 (trimmed to 1,500 on overflow) since virtualization eliminates the rendering cost.
- **Removed redundant log polling** — The 5-second timer no longer calls `refreshLogs()` unconditionally; log content is only populated when the Logs tab activates the live tail process.
- **Stable line identifiers** — Each log line carries a monotonically increasing ID, so `ForEach` diffs efficiently when lines are trimmed from the front of the buffer.
- **No more brew polling for updates** — `brew outdated` was slow (~2-4s) and ran every 30 minutes; replaced with `legion-gem outdated` which is sub-second.

## [2.2.4] - 2026-05-22

### Fixed
- **Restart stuck on "Stopping..."** — `restartService` now correctly transitions to `.running` after `brew services restart` completes.
- **Service card button alignment** — Restart/stop buttons on Redis, Memcached, and Ollama cards now align with the LegionIO Daemon card.

### Changed
- **Wait for `/api/ready` before online** — The daemon is only shown as "running" after both `brew services` reports it running AND the HTTP health endpoint confirms ready (120s timeout).
- **Elapsed seconds counter** — Starting/stopping states now show a live seconds counter (e.g. `starting... 5s`).

## [2.2.3] - 2026-05-22

### Changed
- **Daemon lifecycle via brew services** — Start, stop, and restart for the LegionIO daemon now use `brew services` (same as redis/memcached/ollama) instead of launching the process directly. Simpler, more consistent, and survives app restarts.
- **Status from brew services** — Online/offline status for the daemon is now determined by `brew services info legionio --json` rather than the HTTP health endpoint.
- **Logs tail brew log** — Logs tab tails the brew service log (`/opt/homebrew/var/log/legion/legion.log`) detected dynamically at init, instead of the custom interlink.log written via `tee`.

### Removed
- Direct daemon process management (stdout piping, `tee` log capture, `legionio start`/`stop` CLI calls).

## [2.2.2] - 2026-05-22

### Fixed
- **Service status in .app bundle (redux)** — `HOMEBREW_NO_INSTALL_FROM_API=1` added to the brew child process environment. The `.app` sandbox blocks DNS, causing brew to fail while trying to refresh its formula API cache from `formulae.brew.sh` before returning any service status JSON. This flag tells brew to use local taps and skip all network fetches entirely. Confirmed fix with `env -i` simulation matching the launchd environment.
- **Updates tab crash** — `UNUserNotificationCenter.current()` now guarded with a `Bundle.main.bundleIdentifier != nil` check so dev builds (plain binary, no bundle) skip notifications silently instead of crashing.
- **Restart buttons** — All service cards (including LegionIO Daemon) now show a yellow **restart** button alongside **stop** when running.
- **Version number in title bar** — App version (`v2.2.x`) displayed top-right; clock removed.

## [2.2.1] - 2026-05-22

### Fixed
- **Service status in .app bundle** — Redis, Memcached, and Ollama now correctly show as running when the app is launched from the menu bar (brew-installed). macOS launches `.app` bundles with a bare `PATH` that omits `/opt/homebrew/bin`, causing `brew services info` to fail silently. All child processes (service checks, start/stop, daemon launch) now receive an explicit `PATH` that includes both Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`) Homebrew prefixes.
- **Log capture after app reopen** — Logs tab now streams live output after closing and reopening the app while the daemon continues running. The daemon is launched via `tee -a ~/.legionio/logs/interlink.log` so output is persisted to disk. On reopen, the Logs tab starts a `tail -f` process on that file for real-time streaming instead of periodic polling.

## [2.1.0] - 2026-05-19

### Added
- **LLM Settings tab** — surfaces all `legion-llm` settings (defaults, routing, embedding, budget, tool trigger, prompt caching, context curation, conversation, RAG, escalation, arbitrage, debate, fleet, compliance, discovery, batch, scheduling, skills, pipeline/telemetry) with live editing.
- **GAIA tab** — live status from `/api/gaia/status` plus editable settings (core, session, channels, output, notifications, knowledge, router).
- **MCP tab** — accordion layout with Settings section (core, deferred loading, dynamic tools, self-generate/codegen) and Servers section listing configured MCP servers with transport/command info.
- **Providers tab** — accordion-style provider instances that expand to show per-provider models fetched from `/api/llm/providers/:name/models`.
- **Updates tab** — checks `brew outdated` for legionio and `legion-gem outdated` for legion-*/lex-* gems; per-item and "Update All" buttons; background check every 30 minutes with macOS notifications for outdated brew/core libraries; auto-updates lex-* gems (safe — old versions kept).
- `SettingsFile` utility — writes settings to `~/.legionio/settings/<category>.json` on save (llm.json, gaia.json, mcp.json) in addition to hot-reloading via daemon PUT endpoint.
- `CLAUDE.md` — developer reference for the Swift codebase.

### Changed
- Renamed former "LLM" tab to "Providers" (accordion provider instances with models).
- Tab bar expanded: Services, Logs, Identity, LLM, Providers, GAIA, MCP, Extensions, Workers, Updates, Settings.
- `README.md` rewritten to reflect current Swift process manager architecture.
- `DaemonCache` gains per-provider model loading (`loadProviderModels`, `clearProviderModels`).

## [2.0.0] - 2026-05-04

### Changed
- **BREAKING**: Replaced the Electron desktop chat client with a native Swift macOS menu bar app. Legion Interlink is no longer a desktop chat UI — it is a menu bar utility that bootstraps, monitors, and controls the LegionIO daemon stack (legionio, redis, memcached, ollama).
- Minimum macOS version raised from 10.13 to 13 (Ventura).
- App size reduced from ~454MB (Electron + Chromium + Node) to ~592KB (native Swift binary).

### Added
- Menu bar item with Legion icon and live status badge reflecting daemon health.
- Native dashboard window with five tabs: Services (default), Logs, Extensions, Workers, Settings.
- Service cards with start/stop controls, daemon component readiness indicators, and start-all / stop-all actions.
- Live daemon log viewer with auto-scroll toggle and clear.
- Search filtering across Extensions, Workers, and Settings tabs.
- First-launch onboarding that auto-starts services and installs the agentic extension pack when `~/.legionio/.packs/agentic` is absent.
- Health polling that updates service status within 5 seconds of state changes.
- Launch-at-login toggle.
- Universal binary builds (arm64 + x86_64) with code signing, notarization, and Homebrew Cask updates wired into release CI.

### Removed
- All Electron, React, TypeScript, and Node.js code (~70k lines, 245+ files), including the chat thread, sub-agent views, MCP integration UI, skills UI, memory/compaction settings UI, and trigger workflow components.
- All npm dependencies (52 known vulnerabilities eliminated).

### Migration
Chat and AI assistant functionality has moved to **Kai** (`brew install --cask legionio/tap/kai`), which connects to the same legionio daemon stack via the `kai-plugin-legion` plugin. Legion Interlink now exists solely to manage the daemon services.

## [1.1.6] - 2026-04-22

### Changed
- Model catalog now fetched from daemon `/v1/models` endpoint instead of requiring manual config in `~/.legionio/config.json`; discovers all models the daemon has valid credentials for at runtime
- Falls back to `/api/llm/providers` (default model per provider) when `/v1/models` is unavailable, then to local config catalog if daemon is unreachable
- Exposed `daemon:llm-models` IPC handler for direct `/v1/models` access from renderer

## [1.1.5] - 2026-04-21

### Fixed
- `MessageTimestamp` crashes with `date.toDateString is not a function` when `message.createdAt` is a string or number instead of a `Date` object (e.g. after conversation restore from JSON persistence)
- `ProactiveMessage` timestamp rendering crashes on invalid date strings
- Proactive message fallback in `Thread.tsx` calls `.toISOString()` on string `createdAt` values from deserialized messages
- `ConversationList.formatRelativeTime` returns garbage on malformed timestamp strings

## [1.1.4] - 2026-04-17

### Performance
- Removed unused `ComposerBackdrop` dead code; no shipped runtime behavior change for composer backdrop handling (#24)
- `Thread`: matrix canvas animation now pauses on `visibilitychange`/window `blur` and resumes on focus; frame interval throttled from 65ms (~15fps) to 130ms (~8fps) (#25)
- `ConversationList`: replaced 1500ms `setInterval` polling with `conversations:changed` IPC push subscription — eliminates 40+ IPC round-trips/min for users with large conversation history (#26)
- `ConfigProvider`: context value wrapped in `useMemo`, `updateConfig` stabilized with `useCallback` — stops cascading re-renders across all settings consumers on every config update
- `ElapsedBadge`: replaced N independent 100ms per-badge intervals with a single shared 500ms module-level ticker — one `setInterval` for all running tool badges combined
- `GaiaPresenceIndicator`: GAIA status poll interval increased from 10s to 30s (always-mounted sidebar component; status changes infrequently)

### Security
- Replaced `Math.random()` with `crypto.getRandomValues()` for observer session IDs (`electron/ipc/agent.ts`) and computer-use session IDs (`shared/computer-use.ts`) — fixes insecure randomness in security-sensitive ID generation (#8, #9)
- Guarded `setNestedValue` (`electron/ipc/config.ts`) and `setNested` (`electron/tools/config-manage.ts`) against prototype pollution — path segments `__proto__`, `constructor`, and `prototype` are now rejected; traversal uses `hasOwnProperty` (#10, #11)
- Fixed incomplete HTML sanitization in `web-fetch` tool: script/style regexes now match whitespace before closing `>` (e.g. `</script  >`), and HTML comments are explicitly stripped before tag removal (#2, #3, #7)
- Fixed incomplete HTML sanitization in `web-search` tool: title/snippet stripping now uses a full pipeline (script → style → comments → tags) instead of a single tag-only pass (#4, #5)
- Fixed incomplete HTML comment stripping in `CodeBlock` HTML minification: added second pass to remove unclosed `<!--` fragments left by malformed HTML (#6)

## [1.1.3] - 2026-04-17

### Fixed
- `stringifyValue` in `electron/agent/app-runtime.ts` now passes string values through directly instead of calling `JSON.stringify` on them, preventing double-encoding artifacts (`\"some text\"`) in LLM context
- `formatResult` in `src/components/thread/ToolGroup.tsx` guards against the same double-encoding on the display path after `sanitizeResultForDisplay` unwrapping

## [1.1.2] - 2026-04-12

### Added
- `DaemonChatClient` — HTTP + SSE client for `/api/llm/inference` and `/api/skills/*` daemon endpoints, replacing direct local skill execution in Interlink

### Changed
- Skills IPC (`electron/ipc/skills.ts`) rewritten to delegate all skill operations to the Legion daemon instead of executing locally; list, show, and run now proxy through `DaemonChatClient`

## [1.1.0] - 2026-04-09

### Removed
- Standalone Mastra agent runtime — all inference now requires the Legion daemon
- Direct LLM provider integrations (OpenAI, Anthropic, Bedrock, Azure language-model factory)
- Client-side compaction, tokenization, and memory system (daemon handles its own context)
- Tool observer (secondary LLM monitoring tool execution)
- Title generation via direct LLM calls
- Mastra instance and workflow engine
- kai-desktop builder pattern and plugin files

### Added
- Daemon circuit breaker: when health check fails, all non-health requests short-circuit instantly for 10s, dramatically reducing idle CPU
- HUNG tool state: tools that never receive a result are marked with an amber "HUNG" badge instead of ticking RUNNING forever
- Persisted conversation repair: old conversations with stuck tools are fixed on load
- Thread archive: archive/unarchive threads instead of deleting them, with sidebar toggle to view archived
- Right-click context menu on threads: rename, archive, export, delete
- Inline thread rename from context menu or sidebar
- Export dialog accessible from context menu
- Drag-and-drop files now include full filesystem path in the message
- New conversations default working directory to user home (`~/`) instead of null
- Tool path resolution defaults to home directory when no cwd is set

### Changed
- CI/CD workflow: auto-build and release on push to main, run checks on PRs, skip release if tag exists
- Chat thread max-width widened from 1024px to 1600px to reduce wasted space on large screens
- Message spacing tightened (12px gaps instead of 24-32px) for denser thread view
- Settings panel: removed dead sections (Models, Profiles, Memory, Compaction, Advanced, Sub-Agents)
- Settings panel: flattened daemon settings to top-level — no more nested collapsible group

## [1.0.18] - 2026-04-07

### Added
- Server-computed `durationMs` for tool calls — eliminates 0ms display on sub-second tools
- Token usage extraction from daemon `done` payload, emitted as `context-usage` event
- `model-fallback` SSE event handling — model selector updates to reflect actual model used after pipeline fallback
- `conversation_id` forwarded to daemon SSE requests

### Changed
- Tool timing prefers explicit `startedAt`/`finishedAt`/`durationMs` from daemon over generic timestamp field
- Completed tools enforce minimum 1ms display instead of showing 0ms

## [1.0.17]

### Added
- 18 daemon IPC proxies for v1.7.0 endpoints (structural index, tool audit, state diff, session search, triggers CRUD, token budget, native dispatch, context curation)
- Zod config schemas for 7 daemon LLM settings (context curation, debate, prompt caching, token budget, provider layer, tier routing, escalation)
- GAIA presence indicator in sidebar (online/dream/offline status dot with tooltip)
- Token usage display on assistant messages (input/output/cache token counts, collapsible)
- Pipeline insights rendering for debate enrichments and context curation metadata
- LLM Pipeline settings panel with 7 collapsible sections and live daemon status
- Proactive messaging with layered delivery (toast notifications, inline injection, pinned GAIA thread)
- Native Electron notifications for proactive messages when app is backgrounded
- Pinned GAIA thread in sidebar for accumulating proactive messages and trigger observations
- Conditional message chain architecture (daemon mode uses legion-llm parent-link chains with sidechains, mastra mode keeps existing messageTree)
- Sidechain grouping and rendering for daemon-originated sub-agent messages
- Trigger dispatch system with rule-based triage (ignore/observe/act) and GAIA integration
- Trigger workflow sidebar section with source icons, status indicators, auto-dismiss
- Trigger rules settings panel with CRUD editor, concurrency control, approval mode
- Tool schema forwarding to daemon `/api/llm/inference` endpoint so daemon mode has access to interlink's file, shell, web, and MCP tools
- Triggers config schema with rule definitions and persistence

### Fixed
- Knowledge config (RAG Context, Knowledge Capture, Scope) not persisting — `knowledge` was missing from `desktopConfigPayload` allowlist
- New config sections (`daemonLlm`, `proactiveMessaging`, `messageChains`, `triggers`) added to persistence allowlist
- Conversation title not updating when switching conversations (showed "New Conversation" instead of actual title)
- GAIA thread IPC handlers not registered in main process
- GAIA thread and presence indicator not mounted in sidebar
- Governance approvals panel crashing when daemon returns non-array response
