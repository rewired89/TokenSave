# TokenSave

Two independent tools, same goal (reduce tokens spent on AI coding
sessions), different mechanisms:

- **[`save-tokens/`](save-tokens/)** — compresses a draft message before you
  submit it to any AI chat, so the tokens charged on send are already the
  short version. A browser extension, a CLI, and a Windows AutoHotkey
  hotkey, all built on one pure-heuristic `compress.js` (no model call, no
  network, no API keys).
- **[`distill-plugin/`](distill-plugin/)** — a Claude Code plugin
  (`/distill`, `/codemap`) that compacts a finished conversation into a
  build-spec for handoff, and generates per-directory `CODEMAP.md` indexes
  so agents don't have to read full source to navigate a repo.

One repo, two packages: they share no code, but both are small,
zero-dependency-at-runtime, and aimed at the same problem, so one repo with
two top-level directories is less overhead than two repos with duplicated
CI/README/license boilerplate.

## Status — what's proven, what's verified here, what's still a gap

Nothing below is marked done without having actually been run in this
environment. Where something couldn't be run (no Windows host, no
authenticated claude.ai session), that's stated as a gap, not glossed over.

| Component | Proven | How |
|---|---|---|
| `compress.js` | Yes | 21 Jest tests: filler removal + grammar-debris repair, requirement preservation (URLs/quotes/code/numbers/paths), near-duplicate collapsing, contraction-vs-quote edge case. |
| `cli.js` | Yes | Exercised via the same test run (stdin → stdout). |
| Browser extension | Partially | Runtime DOM behavior verified against a local Playwright/Chromium harness reproducing a framework that gates edits through `beforeinput`, confirming the original direct-DOM-write approach silently fails and the `execCommand`-based rewrite doesn't. **Not verified against live claude.ai** — no authenticated browser session reachable from this sandbox. Manifest and static code separately verified Firefox-valid with Mozilla's `web-ext lint` (0 errors, 0 warnings) — single cross-browser manifest, no background script. Details: `save-tokens/extension/VERIFICATION.md`. |
| AutoHotkey script | No, statically hardened only | No Windows host in this sandbox to run AutoHotkey against. Reviewed for AHK v1 syntax correctness and hardened for the known clipboard-timing risk (retry/backoff, settle delay before clipboard restore). Needs a real run on Windows before you trust it. |
| Claude Code plugin (`/distill`, `/codemap`) | Yes | Manifest validated with the real `claude plugin validate` (schema drift was found and fixed — see below). Installed via a real local marketplace with `claude plugin install`. Both commands run to completion in fresh `claude -p` sessions: `/codemap` produced a real `CODEMAP.md`; `/distill` produced a correct `SPEC.md` from real conversation content and correctly declined to fabricate one when given none. |

### What schema drift was found and fixed

The prototype's `plugin.json` was checked against the actual manifest
schema shipped in this environment's Claude Code CLI (`claude plugin
validate`), not assumed correct:

- The manifest must live at `.claude-plugin/plugin.json`, not a bare
  `plugin.json` at the plugin root — the loader only validates the former.
- `author` must be an object (`{"name": "..."}`), not a plain string — the
  schema is `.strict()` and rejects the wrong shape outright.
- `codemap.md`'s bash block referenced its own script via a
  `dirname "${BASH_SOURCE[0]}"` shell trick, which doesn't resolve anything
  useful once a command's markdown body is just text an agent reads and
  executes — there's no script being sourced. Replaced with
  `${CLAUDE_PLUGIN_ROOT}`, the actual substitution variable Claude Code
  provides for exactly this.

Everything else in the prototype (the `commands` array format, the
`argument-hint`/`description` frontmatter fields) matched the real schema
as-is.

## Constraints honored

- Zero network calls, zero API keys, zero telemetry anywhere in
  `save-tokens/`. `compress.js` is a pure heuristic — no model call.
- `compress.js`'s existing behavior contract (never remove URLs, quoted
  strings, code fences/inline code, numbers, or file paths) is unchanged
  and covered by tests, not just asserted.

## Repo layout

```
save-tokens/
  compress.js          — pure heuristic draft compressor (no deps)
  cli.js                — stdin -> distill() -> stdout
  tests/                — Jest suite (compress.js + extension-sync check)
  extension/             — Chrome MV3 extension (manifest.json, content.js,
                           compress.js packaging copy, VERIFICATION.md)
  ahk/                   — save-tokens.ahk (Windows hotkey)
distill-plugin/
  .claude-plugin/plugin.json — plugin manifest (canonical location)
  commands/               — /distill, /codemap
  scripts/codemap.py      — the actual codemap generator
.claude-plugin/marketplace.json — lets this whole repo be added as a
  plugin marketplace: `claude plugin marketplace add <this repo>`
```

## Development

Everything here is developed and pushed directly to `main` — see
`CLAUDE.md` for the repo's working rules.
