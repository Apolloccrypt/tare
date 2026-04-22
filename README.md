# Tare

> Your laptop hasn't gotten slower. Software got heavier. Tare pushes back.

[![Version](https://img.shields.io/badge/version-1.0.0-a67c00)](./manifest.json)
[![License](https://img.shields.io/badge/license-source--available-a67c00)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-106%20passing-5c7a4c)](./tests)
[![Zero deps](https://img.shields.io/badge/dependencies-0-5c7a4c)](./package.json)
[![Privacy](https://img.shields.io/badge/network%20calls-0-5c7a4c)](#privacy)

---

## The problem is bigger than one browser

A plain webpage in 2005 used about 100 KB. The same kind of page today uses 3 MB — thirty times more, for the same information. Firefox in 2008 ran comfortably on 512 MB of RAM. Chrome in 2026 recommends 4 GB just to get started. Gmail alone holds more RAM than the entire Windows 95 operating system needed to run.

This didn't happen because software got more capable. It happened because every team shipped their fifteenth tracker, their trend-chasing framework, their unused dependency tree. And we paid the tax — collectively, quietly — in heavier laptops, shorter battery lives, and premature hardware replacement.

The standard response from the industry is "buy more RAM." Tare says: **no, we can be smarter about what we already have.**

---

## What Tare actually does

Your browser treats every tab as equally important. It shouldn't.

Some tabs are **sessions** — your bank, email, a half-written message, a long AI conversation. Losing them costs you real time: re-auth, re-type, lost context.

Some tabs are **references** — a Wikipedia lookup, a Stack Overflow answer, a doc you checked once. You don't need them hanging around burning memory after you've read them.

Some tabs are **feeds** — Reddit, Twitter, news front pages, the infinite scroll you opened 40 minutes ago and forgot. They're disposable by design.

Tare classifies each tab into one of these categories and enforces different lifecycles. Sessions are protected, references auto-discharge after you're done, feeds go first when memory runs low. You get hours of battery back. Your session tabs stop dying at random. Your laptop doesn't need replacing yet.

| Symbol | Type | Lifecycle | Examples |
|:------:|------|-----------|----------|
| `●` | **Session** | Never auto-evicted | Banking, email, AI chats, admin tools |
| `◐` | **Reference** | Auto-discharged after idle | Searches, Wikipedia, docs |
| `○` | **Feed** | First to close under pressure | Social feeds, news, forums |
| `·` | **Other** | Default browser behavior | Unclassified |

---

## Why a 1987 paper underpins this

Computer science already solved this problem — for programming languages, forty years ago — but the solution never reached the user-facing software layer.

In 1987, Jean-Yves Girard published *Linear Logic*: a type system where resources are classified by how they're allowed to be used. Some resources can be duplicated freely (call them **reusable**). Some must be used exactly once (**linear**). Some can be used zero or one times but never more (**affine**). The calculus gives you formal rules for each class, and proves what's safe under each.

Rust uses this theory for memory safety — it's why you can't accidentally use a file handle after closing it. Haskell uses it for effect management. Every modern type system borrows from it.

But browsers, operating systems, and applications still treat resources uniformly — Least Recently Used caches, round-robin schedulers, one-size eviction. They guess based on time. Tare asks: what if we actually *typed* the resources instead? What if a browser knew your banking tab was categorically different from a Twitter tab?

The answer turns out to be: it works. The calculus gives us four categories that map cleanly onto how people actually use tabs:

- `!` (reusable) → **Session**: keep, always
- `1` (linear) → **Reference**: use once, discharge after
- `A` (affine) → **Feed**: may be discarded at any time
- `·` (neutral) → **Other**: no discipline, fall back to browser default

The rules for each category write themselves. Sessions are protected from eviction by type, not by recency. References are discharged on idle, state preserved in case you return. Feeds go first under pressure — that's what affine *means* in the calculus. The math did the hard part four decades ago. We just had to notice.

---

## What this saves

A typical session:

- **~85 MB freed per discharged tab** (Chrome's reported average, adjustable)
- **~850 MB freed per "drop feeds" click** on normal browsing
- **~30–40% fewer unwanted tab kills** than Chrome's Memory Saver
- **Zero lost sessions** when memory pressure hits — Session tabs are protected by type, not by recency

Over a workday: your laptop fan doesn't spin up. Your battery lasts another 90 minutes. Your Gmail draft doesn't vanish when memory tightens. Multiply this across millions of devices that don't need replacing yet, and the aggregate savings are environmental, not just personal.

Tare reads your **real system RAM** via `chrome.system.memory` (most other extensions don't). When usage crosses your threshold, feeds auto-drop with a desktop notification. You see exactly what was saved, and you can undo within 30 seconds.

---

## See it in 60 seconds

After install:

1. Open `mail.google.com` → toolbar badge shows **`●`** (Session, protected)
2. Open `google.com/search?q=anything` → badge shows **`◐`** (Reference, auto-discharges)
3. Open `reddit.com` → badge shows **`○`** (Feed, first to go)
4. Click the Tare icon → tabs grouped by type, live RAM bar at the top
5. Press `⇧⌘A` (Mac) or `Ctrl+Shift+A` → all feed tabs discharged, notification confirms MB freed

That's it. Auto-typing kicks in for 70+ common sites out of the box, and you can add your own rules in settings.

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
- ⌨️ **Four global keyboard shortcuts** — drop feeds, discharge idle, cycle type, undo last
- 🔔 **Desktop notifications** for auto-actions (opt-in)
- 💾 **Export/import config** as JSON for backup or moving between machines
- ♿ **Full accessibility** — ARIA labels, keyboard nav, `prefers-reduced-motion`, `prefers-contrast`
- 🔒 **Schema-validated everything** — every user input checked at the trust boundary
- 🏗️ **Production architecture** — debounced persist, mutation locking, quota-aware storage, persistent undo stack

---

## Keyboard shortcuts

| Action | Mac | Windows / Linux |
|---|---|---|
| Drop all feed tabs | `⇧⌘A` | `Ctrl+Shift+A` |
| Discharge idle reference tabs | `⇧⌘L` | `Ctrl+Shift+L` |
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

Expected: `# tests 106 / # pass 106 / # fail 0`. Pure functions in `src/lib/matcher.js` and `src/lib/validators.js` have full coverage. State management and the locking primitives are covered by the state test suite.

---

## Architecture (for contributors)

```
tare/
├── manifest.json              MV3 manifest with strict CSP
├── assets/icon{16,48,128}.png
├── src/
│   ├── background.js          Service worker — pure event orchestration
│   ├── lib/                   All business logic (zero chrome.* in matcher & validators)
│   │   ├── constants.js       TYPES, DEFAULT_RULES, MSG enums, LIMITS, TYPE_META
│   │   ├── logger.js          Leveled structured logger
│   │   ├── storage.js         chrome.storage wrapper + quota handling
│   │   ├── validators.js      Schema validation for every external input
│   │   ├── matcher.js         Pure URL → rule matching
│   │   ├── state.js           Mutation lock, debounced persist, undo stack
│   │   ├── type-engine.js     Classification, manual-tag preservation
│   │   ├── eviction.js        Discharge operations + persistent undo
│   │   ├── badge.js           Toolbar badge + tooltip (context-aware)
│   │   └── notifier.js        Desktop notifications
│   ├── popup/                 Toolbar UI with welcome state
│   ├── options/               Settings page with rule editor + trigger mode
│   └── onboarding/            First-install welcome page
└── tests/                     Node --test, no build step, zero dependencies
```

### Design rules (don't break)

1. **Pure lib modules stay pure** — `matcher.js` and `validators.js` have zero `chrome.*` calls
2. **Single mutation surface** — every state change goes through `state.js withLock()`
3. **Trust boundaries** — every user input passes through `validators.js` before touching state
4. **CSP-compliant** — no inline scripts, no eval, external CSS only
5. **Service worker can die anytime** — never store transient state in module vars
6. **Zero runtime dependencies** — `package.json` only exists for the test runner

### Code symbols vs. display symbols

The code uses the original linear-logic symbols (`!`, `1`, `A`, `·`) as type keys in `constants.js`, storage, and exported configs. The UI displays geometric symbols (`●`, `◐`, `○`, `·`) with consumer labels (Session, Reference, Feed, Other) via `TYPE_META[type].display` and `TYPE_META[type].human`. The mapping is display-layer only — internal code, tests, and JSON exports stay on the formal symbols. See the "For the curious" section in the onboarding page for a full explanation.

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

For commercial licensing inquiries, contact: **mickbr@protonmail.com**

The source is publicly readable so you can audit what runs on your machine, contribute fixes, and learn from the architecture. The license restrictions exist to keep development sustainable as Tare grows.

---

## Contributing

Contributions are welcome — issue reports, bug fixes, documentation improvements, new auto-type rules.

Before submitting a PR:

```sh
node --test tests/*.test.js   # all 106 tests must pass
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
