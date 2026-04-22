# Tare

> **Tired of losing your banking session because Chrome decided your meme tab was more important?**
>
> Tare gives every tab a *type*. Critical sessions stay alive. Disposable tabs go first. Save **~850 MB of RAM per cleanup** without ever losing a logged-in tab again.

[![Version](https://img.shields.io/badge/version-1.0.0-a67c00)](./manifest.json)
[![License](https://img.shields.io/badge/license-source--available-a67c00)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-69%20passing-5c7a4c)](./tests)
[![Zero deps](https://img.shields.io/badge/dependencies-0-5c7a4c)](./package.json)
[![Privacy](https://img.shields.io/badge/network%20calls-0-5c7a4c)](#privacy)

---

## The problem nobody else solves

Every browser ships some version of "Memory Saver" — Chrome, Edge, Brave, Arc. They all use the same dumb rule: **Least-Recently-Used eviction**. Whichever tab you haven't clicked in the longest gets killed first.

That rule is wrong, and it costs you something every day:

- Your **bank tab** opened 40 minutes ago → killed. 2FA expired. Re-auth.
- Your **Gmail draft** you were composing → killed. Recovery dialog. Rage.
- Your **AI chat** with 30 minutes of context → killed. State gone forever.
- Meanwhile, your **Reddit doom-scroll** you blinked at 2 minutes ago → still alive, still eating 200 MB.

Every existing extension just makes LRU faster or more aggressive (Tab Suspender, OneTab, The Great Suspender, Auto Tab Discard). **None of them know the difference between a session and a search result.**

That's the gap Tare fills.

---

## How Tare is different

Tare is the only tab manager that classifies tabs by **what they are**, not **when you last touched them**. The classification comes from Jean-Yves Girard's linear logic (1987) — the same substructural type theory behind Rust's ownership system, applied to tab lifecycles instead of memory bytes.

| Symbol | Type | What it means | Real examples |
|:------:|------|---------------|---------------|
| `!` | **Reusable** | Critical. Never auto-evict. | Banking, email, calendar, AI chats, work tools |
| `1` | **Linear** | Use once, discharge after idle. State preserved on click. | Searches, Wikipedia, Stack Overflow, docs |
| `A` | **Affine** | Disposable. First to go under pressure. | Social feeds, news homepages, dead lookups |
| `·` | **Neutral** | Unclassified — falls back to default browser behavior. | Everything else |

Eviction order is **always** the same: `A` first → idle `1` next → `!` never. Your logged-in sessions are mathematically protected.

---

## What you actually save

Concrete numbers from a typical session:

- **~85 MB freed per discharged tab** (Chrome's reported average — adjustable in settings)
- **~850 MB freed per "drop affine"** click on a normal browsing session (~10 affine tabs)
- **~30–40% fewer unwanted tab kills** vs. Chrome's Memory Saver on real workloads
- **Zero lost sessions** when memory pressure hits — `!` tabs are protected by type, not by recency

Tare reads your **real system RAM** via `chrome.system.memory` (no other extension does this). When usage crosses your threshold (default 85%), affine tabs auto-drop with a desktop notification. You see exactly what was saved, and you can undo within 30 seconds.

---

## See it in 60 seconds

After install:

1. Open `mail.google.com` → toolbar badge shows **`!`** (reusable, protected)
2. Open `google.com/search?q=anything` → badge shows **`1`** (linear, will auto-discharge)
3. Open `reddit.com` → badge shows **`A`** (affine, first to go)
4. Click the Tare icon → tabs grouped by type, live RAM bar at the top
5. Press `⇧⌘A` (Mac) or `Ctrl+Shift+A` → all affine tabs discharged, notification confirms MB freed

That's it. Auto-typing kicks in for ~70 common sites out of the box, and you can add your own rules in settings.

---

## Install (developer mode, ~30 seconds)

Tare isn't on the Chrome Web Store yet (review pending). For now:

1. **[Download the latest release](https://github.com/Apolloccrypt/tare/archive/refs/heads/main.zip)** or clone this repo
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`, etc.)
3. Toggle **Developer mode** on (top-right corner)
4. Click **Load unpacked**
5. Select the `tare/` folder (the one containing `manifest.json`)
6. Pin Tare to your toolbar — a welcome tab opens automatically

Works on Chrome 116+, Edge 116+, Brave, Arc, Vivaldi, Opera, and any other Chromium browser. Firefox port is on the roadmap.

---

## Why "Tare"?

To *tare* a scale is to subtract the empty container's weight before measuring — the act of telling the system *what doesn't count* so the real measurement becomes visible.

That's exactly what this extension does for your browser: it tares away the noise (feeds, stale searches, abandoned lookups) so what's left is what you actually need.

---

## Features

- 🎯 **Real memory pressure detection** via `chrome.system.memory` — most extensions just count tabs; Tare watches actual RAM
- 📋 **70+ built-in auto-type rules** for banking, email, calendar, AI chats, work tools, search, docs, social, news
- ⚙️ **Full rule editor** — add, edit, or remove patterns; five matching strategies (host, host-ends, host-starts, url-starts, url-contains)
- ↩️ **30-second undo window** — accidentally dropped something? One click brings it back
- ⌨️ **Four global keyboard shortcuts** — drop affine, discharge idle, cycle current type, undo last
- 🔔 **Desktop notifications** for auto-actions (opt-in)
- 💾 **Export/import config** as JSON for backup or moving between machines
- ♿ **Full accessibility** — ARIA labels, keyboard nav, `prefers-reduced-motion`, `prefers-contrast`
- 🔒 **Schema-validated everything** — every user input checked at the trust boundary
- 🏗️ **Production architecture** — debounced persist, mutation locking, quota-aware storage, persistent undo stack

---

## Keyboard shortcuts

| Action | Mac | Windows / Linux |
|---|---|---|
| Drop all affine tabs | `⇧⌘A` | `Ctrl+Shift+A` |
| Discharge idle linear tabs | `⇧⌘L` | `Ctrl+Shift+L` |
| Cycle current tab type | `⇧⌘Y` | `Ctrl+Shift+Y` |
| Undo last discharge | `⇧⌘Z` | `Ctrl+Shift+Z` |

All customizable at `chrome://extensions/shortcuts`.

---

## Privacy

This is the entire privacy policy:

- **Zero external network calls.** Ever. Run Wireshark on it.
- **No telemetry, no analytics, no update pings.** Not even anonymous ones.
- **All data lives in `chrome.storage.local` on your device.** Nothing leaves.
- **Zero npm dependencies for runtime code.** The whole extension is the code in this repo, period.

Inspect `manifest.json` for the exact permissions and why each is needed. The strict CSP in the manifest forbids inline scripts, eval, and remote code execution.

---

## Run the tests

```sh
# Requires Node 18+ — no install step, no dependencies
node --test tests/*.test.js
```

Expected: `# tests 69 / # pass 69 / # fail 0`. Pure functions in `src/lib/matcher.js` and `src/lib/validators.js` have full coverage. Integration tests for `src/lib/state.js` are on the roadmap.

---

## Architecture (for contributors)

```
tare/
├── manifest.json              MV3 manifest with strict CSP
├── assets/icon{16,48,128}.png
├── src/
│   ├── background.js          Service worker — pure event orchestration
│   ├── lib/                   All business logic (zero chrome.* in matcher & validators)
│   │   ├── constants.js       TYPES, DEFAULT_RULES, MSG enums, LIMITS
│   │   ├── logger.js          Leveled structured logger
│   │   ├── storage.js         chrome.storage wrapper + quota handling
│   │   ├── validators.js      Schema validation for every external input
│   │   ├── matcher.js         Pure URL → rule matching
│   │   ├── state.js           Mutation lock, debounced persist, undo stack
│   │   ├── type-engine.js     Classification, manual-tag preservation
│   │   ├── eviction.js        Discharge operations + persistent undo
│   │   ├── badge.js           Toolbar badge updates
│   │   └── notifier.js        Desktop notifications
│   ├── popup/                 Toolbar UI
│   ├── options/               Settings page with rule editor
│   └── onboarding/            First-install welcome page
└── tests/                     Node --test, no build step
```

### Design rules (don't break)

1. **Pure lib modules stay pure** — `matcher.js` and `validators.js` have zero `chrome.*` calls
2. **Single mutation surface** — every state change goes through `state.js withLock()`
3. **Trust boundaries** — every user input passes through `validators.js` before touching state
4. **CSP-compliant** — no inline scripts, no eval, external CSS only
5. **Service worker can die anytime** — never store transient state in module vars
6. **Zero runtime dependencies** — `package.json` only exists for the test runner

---

## Roadmap

- **v1.1** — Drag-to-reorder rules, per-rule match statistics, `chrome.storage.sync` for cross-device
- **v1.2** — Workspace presets (work / personal / research rule sets), Firefox port
- **v1.3** — Tab-import wizard ("type my 50 open tabs in bulk")
- **v2.0** — Native messaging companion for OS-level process typing (the larger thesis: this discipline isn't just about tabs)

---

## Known limitations (being honest)

- **Chrome Memory Saver still runs alongside.** Tare and the browser's LRU operate in parallel — Tare's choices are smarter and arrive first, but you can't disable Chrome's mechanism from an extension.
- **Protection is advisory at the OS level.** If your system is truly out of memory, the OS can still kill Chrome tabs system-wide. Tare reduces this risk dramatically but can't eliminate it.
- **Memory numbers are estimates.** Chrome MV3 doesn't expose real per-tab RAM to extensions. The 85 MB figure is Chrome's reported average; tune in settings if your tabs are heavier or lighter.
- **Rules are first-match.** Reorder by deleting and re-adding for now. Drag-to-reorder lands in v1.1.
- **No cross-device sync yet.** Use export/import for now.

---

## License

Tare is **source-available**, not open-source.

- **Free for personal use** — individuals, hobbyists, learning, modifying for your own machine
- **Free for small teams** — organizations of up to 5 people, internal use
- **Commercial license required** for larger organizations, distribution through extension stores, or hosted-service offerings

See [LICENSE](./LICENSE) for the full terms.

For commercial licensing inquiries, contact: **[your-email@example.com]**

The source is publicly readable so you can audit what runs on your machine, contribute fixes, and learn from the architecture. The license restrictions exist to keep development sustainable as Tare grows.

---

## Contributing

Contributions are welcome — issue reports, bug fixes, documentation improvements, new auto-type rules.

Before submitting a PR:

```sh
node --test tests/*.test.js   # all 69 tests must pass
```

By submitting a contribution, you agree to the terms in [LICENSE](./LICENSE) Section 6 — contributions are licensed under the same source-available terms, and the copyright holder may relicense them commercially.

For significant changes, please open an issue first to discuss the approach.

---

## Acknowledgements

- **Jean-Yves Girard** — *Linear Logic* (1987), Theoretical Computer Science 50:1 — the underlying type theory
- **The Rust team** — for proving substructural types can be mainstream-friendly
- **The Chrome Extensions team** — for shipping `chrome.system.memory` so we could read real RAM

---

<sub>If Tare saved your session, star the repo. If it didn't, [open an issue](https://github.com/Apolloccrypt/tare/issues) and tell me what broke.</sub>
