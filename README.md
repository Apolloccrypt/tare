# Tare — Typed Tabs

> Typed lifecycle discipline for browser tabs.
> Protect critical sessions. Discharge used lookups. Evict affine tabs first.

[![Version](https://img.shields.io/badge/version-1.0.0-a67c00)](./manifest.json)
[![License](https://img.shields.io/badge/license-MIT-a67c00)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-69%20passing-5c7a4c)](./tests)

## The name

To *tare* a scale is to subtract the empty container's weight before measuring — the act of telling the system what doesn't count so the real measurement becomes visible. That's what this extension does for tabs: it tares away the noise (feeds, stale searches, abandoned lookups) so your browser holds only what you actually need.

## What it does

Chrome's Memory Saver uses Least-Recently-Used eviction: it drops your banking tab because you haven't clicked it for 40 minutes, but keeps your Reddit doom-scroll because you blinked at it 2 minutes ago.

Tare assigns each tab a **lifecycle type** based on what it actually is, not when you last clicked it:

| Symbol | Type | Behavior | Examples |
|:------:|------|----------|----------|
| `!` | **Reusable** | Keep at all costs | Banking, email, calendar, AI chats |
| `1` | **Linear** | Use once, auto-discharge after idle | Searches, Wikipedia, docs |
| `A` | **Affine** | Evict first under memory pressure | Social feeds, news homepages |
| `·` | **Neutral** | Default Chrome behavior | Everything else |

Eviction order: `A` first, then idle `1`, never `!`. Based on Jean-Yves Girard's linear logic (1987) — the same substructural type theory that underpins Rust's ownership system.

---

## Install (local development)

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome, Edge, Brave, or Arc
3. Toggle **Developer mode** on (top-right)
4. Click **Load unpacked**
5. Select the `tare/` folder (the one containing `manifest.json`)
6. Pin the Tare icon to your toolbar
7. A welcome tab opens automatically with test scenarios

### Quick verification (60 seconds)

After install:

1. Open `https://mail.google.com` → toolbar badge should show **`!`**
2. Open `https://google.com/search?q=test` → badge shows **`1`**
3. Open `https://reddit.com` → badge shows **`A`**
4. Click the Tare icon → tabs grouped by type, with live system RAM bar
5. Press `⇧⌘A` (Mac) or `Ctrl+Shift+A` → affine tab discharged, notification shown

---

## Features

- **Real memory pressure detection** via `chrome.system.memory` — auto-drops affine tabs when RAM > threshold
- **Editable auto-type rules** — full rule editor in the settings page
- **30-second undo window** — every discharge can be reversed
- **Four keyboard shortcuts** — drop affine, discharge idle, cycle type, undo last
- **Desktop notifications** for auto-actions (opt-in)
- **Export/import config** as JSON for backup or cross-device transfer
- **Accessibility** — ARIA labels, keyboard navigation, reduced-motion support
- **Input validation** at every trust boundary — schema-validated imports, bounded numeric settings
- **Production-grade state management** — debounced persist, mutation locking, quota handling

---

## Keyboard shortcuts

| Action | Mac | Windows/Linux |
|---|---|---|
| Drop all affine tabs | `⇧⌘A` | `Ctrl+Shift+A` |
| Discharge idle linear tabs | `⇧⌘L` | `Ctrl+Shift+L` |
| Cycle current tab type | `⇧⌘Y` | `Ctrl+Shift+Y` |
| Undo last discharge | `⇧⌘Z` | `Ctrl+Shift+Z` |

Customize at `chrome://extensions/shortcuts`.

---

## Architecture

```
tare/
├── manifest.json              MV3 manifest
├── assets/
│   ├── icon16.png             Toolbar icon (small)
│   ├── icon48.png             Extensions page icon
│   └── icon128.png            Store & notification icon
├── src/
│   ├── background.js          Service worker — event orchestration only
│   ├── lib/
│   │   ├── constants.js       Single source of truth (TYPES, DEFAULTS, MSG)
│   │   ├── logger.js          Leveled structured logger
│   │   ├── storage.js         chrome.storage wrapper + quota handling
│   │   ├── validators.js      Schema validation for all external input
│   │   ├── matcher.js         Pure URL → rule matching (fully unit-tested)
│   │   ├── state.js           State manager with locking + debounced persist
│   │   ├── type-engine.js     Classification + manual-type preservation
│   │   ├── eviction.js        Discharge operations + undo
│   │   ├── badge.js           Toolbar badge updates
│   │   └── notifier.js        Desktop notifications
│   ├── popup/                 Toolbar popup UI (tabs + about)
│   ├── options/               Settings page (rules editor, toggles)
│   └── onboarding/            First-install welcome page
└── tests/
    ├── constants.test.js      14 tests for constants
    ├── matcher.test.js        24 tests for URL matching
    └── validators.test.js     31 tests for input validation
```

### Principles

- **Pure lib modules** — `matcher.js` and `validators.js` have zero side effects, fully unit-testable
- **Single mutation surface** — all state changes go through `state.js` with `withLock()` serialization
- **Trust boundaries** — every user-provided input (rules, settings, imports, messages) is validated before hitting state
- **CSP-compliant** — no inline scripts, external CSS, strict CSP in manifest
- **Observable** — leveled logger, debug helper exposed on service worker `self.tareDebug`

---

## Local test plan

### Run unit tests

```sh
# Requires Node 18+
cd tare
node --test tests/*.test.js
```

Expected output: `# tests 69 / # pass 69 / # fail 0`.

### Manual test scenarios

**Test 1 · Auto-typing by URL**

1. Open `mail.google.com` → badge `!`
2. Open `google.com/search?q=test` → badge `1`
3. Open `reddit.com` → badge `A`
4. Open `example.com` → badge `·`

**Test 2 · Manual override persists**

1. Right-click any page → *Tare · set tab type → `!` reusable*
2. Open popup → tab shows `!` with a "SET" badge
3. Navigate the tab → type is preserved

**Test 3 · Undo works within 30 seconds**

1. Open 3+ affine tabs (reddit, twitter, etc.)
2. Press `⇧⌘A` → tabs discharged (💤 icons)
3. Open popup → green undo strip appears
4. Click **undo** → tabs reload

**Test 4 · Keyboard shortcuts**

1. Press each shortcut in turn
2. Notifications appear for each action
3. `⇧⌘Y` cycles current tab: `·` → `!` → `1` → `A` → `·`

**Test 5 · Real memory pressure**

1. Open popup → note live RAM bar at top
2. Open many heavy tabs until RAM > 85%
3. Wait up to 2 minutes (next tick)
4. Notification: "Memory pressure. Dropped N affine tabs."

**Test 6 · Custom rule**

1. Open settings (gear icon or right-click extension icon)
2. Add rule: pattern `github.com`, match `host-ends`, type `!`, reason `dev`
3. Open a GitHub page → badge `!`
4. Delete the rule → new GitHub tabs revert to default

**Test 7 · Export/import round trip**

1. Customize some rules
2. **Export config** → JSON downloads
3. **Reset to defaults** → confirm
4. **Import config** → select the exported file → rules restored

**Bonus: verify real memory freed**

Open Chrome Task Manager (`⇧⎋` Mac, `Shift+Esc` Windows/Linux). Click **drop affine**. Memory column drops by ~85 MB × discharged count. Discharged processes disappear.

---

## Development

### Project structure

All business logic lives in `src/lib/`. The service worker in `src/background.js` is a thin orchestration layer that translates Chrome events into lib function calls.

### Adding a new feature

1. Add types/constants to `src/lib/constants.js` if needed (message type, storage key, etc.)
2. Add validation to `src/lib/validators.js` if the feature accepts user input
3. Write pure logic in the appropriate lib module (or create a new one)
4. Write tests in `tests/` — follow the pattern in `matcher.test.js`
5. Wire Chrome events in `src/background.js`
6. Wire UI in `src/popup/` or `src/options/`

### Debugging

1. Open `chrome://extensions`
2. Find Tare → click **service worker** link → opens DevTools for background
3. In the console: `self.tareDebug.setLogLevel('debug')` for verbose logs
4. `self.tareDebug.getState()` shows current state snapshot

### Reinstalling after edits

After editing source files: `chrome://extensions` → click the reload icon on Tare's card.

---

## Known limitations

- **Chrome Memory Saver still runs alongside.** Tare and Chrome's LRU operate in parallel. Tare's decisions are smarter and get there first.
- **Protection is advisory.** If the OS is truly out of memory, tabs can still be killed system-wide. Tare reduces this risk significantly but can't eliminate it.
- **No cross-device sync.** Use export/import to move configs between machines. `chrome.storage.sync` planned for v1.1.
- **Memory numbers are estimates.** Chrome MV3 doesn't expose real per-tab RAM to extensions. The 85 MB default is a Chrome-reported average; adjust in settings.
- **Rules are first-match.** If a URL matches multiple rules, the first one wins. Reorder by deleting and re-adding (drag-to-reorder planned for v1.1).

---

## Privacy

- **Zero external network calls.** All logic runs locally.
- **No telemetry, no analytics.** Never.
- **All data in `chrome.storage.local`** on your device only.

See [`manifest.json`](./manifest.json) for the exact permissions requested and why each is needed.

---

## Browser compatibility

- **Chrome** 116+ (primary target)
- **Microsoft Edge** 116+ (Chromium-based, same APIs)
- **Brave, Arc, Vivaldi, Opera** (Chromium-based, tested on Brave 1.60+)
- **Firefox** not yet supported — WebExtensions spec is mostly compatible but requires adaptation (`chrome.` → `browser.` APIs, different storage quotas). Planned for v1.2.

---

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

Pull requests welcome. For significant changes, please open an issue first to discuss.

Before submitting:

```sh
node --test tests/*.test.js  # all tests must pass
```

---

## Acknowledgements

- Jean-Yves Girard — *Linear Logic* (1987), Theoretical Computer Science 50:1
- The Rust team — for proving substructural types can go mainstream
- Chrome Extensions team — for the MV3 platform
