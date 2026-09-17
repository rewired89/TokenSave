# save-tokens

Compresses your own draft message before it's submitted to an AI chat, so
the tokens charged on send are already the short version. No network calls,
no API keys, no telemetry — `compress.js` is a pure heuristic (regex +
filler-stripping + near-duplicate removal), no model call involved.

## Status

| Piece | Status |
|---|---|
| `compress.js` | Tested. 26 Jest tests, all passing. See "What was fixed" and "Venting-wrapper extraction" below. |
| `cli.js` | Tested (stdin → stdout via `distill()`). |
| `extension/content.js`, `extension/manifest.json` | Rewritten and verified against a local Playwright harness reproducing a rich contenteditable editor's risk profile. **Not** verified against the live, authenticated claude.ai site — see `extension/VERIFICATION.md` for exactly what was and wasn't checked. |
| `ahk/save-tokens.ahk` | Statically reviewed and hardened (retry/backoff on the clipboard copy, a settle delay before restoring the clipboard). **Not executed** — this environment has no Windows host to run AutoHotkey on. |

## compress.js

### What was fixed

The original version removed filler phrases with plain string substitution
and left grammatical debris behind: doubled commas ("So,, help me build"),
dangling leading connectives ("And, help me..." when the clause "and"
introduced was itself filler), and a lowercase sentence start where a
capitalized filler word ("Just", "Please") had been stripped.

The fix is a `cleanupGrammar()` pass that runs after filler removal, per
sentence:

1. Collapses a connective word stranded between two commas (`, so ,` → `, `)
   — this is what's left when the clause a connective introduced was removed
   as filler but the connective itself wasn't.
2. Collapses runs of commas/semicolons left by adjacent filler removals.
3. Strips a comma directly before terminal punctuation or right after an
   opening bracket/quote.
4. Drops a now-dangling leading connective ("So, ", "And, ") — but **only**
   on a sentence filler-removal actually touched, and **only** if real
   content remains afterward, so a sentence you wrote starting with "So" is
   never rewritten for style, and a sentence that was entirely filler
   collapses cleanly instead of leaving a bare "And!".
5. Re-capitalizes the sentence start if the capitalized word there was the
   one that got removed.

Two filler patterns were also widened because they left semantically
dangling fragments, not just punctuation debris: `sorry to bother` didn't
consume its object ("...you with this"), and it does now.

### Venting-wrapper extraction

This is still regex-based — it recognizes specific wrapper *phrasings*, it
does not understand meaning. It does not, and cannot, do full semantic
rewriting into "orders" (that requires a model call, which was explicitly
ruled out to keep this at zero added cost — see Constraints below). What it
does do: recognize common wrappers people use when frustrated about
repeating themselves, and extract the actual instruction from inside them,
same mechanism as filler-phrase removal, just a different phrase list:

- `"I'm tired of telling you to X"`, `"I keep telling you to X"`, `"how many
  times do I have to say this"`, `"for the last time"`, `"I've told you
  before"` → stripped, `X` (the actual instruction) stays.
- A trailing `", and you keep doing it"` complaint, once the instruction's
  already stated → stripped.
- `"stop that/this bullshit/shit/nonsense/crap"` → stripped, but narrowly:
  only that exact vague-complaint shape. A real instruction like `"stop
  committing directly to main"` names the actual thing to stop and is left
  completely alone — this was tested specifically so the tool can't
  mistake a real imperative for venting.
- Profanity and emphasis (`"fucking"`, etc.) are **never** stripped — that's
  the user's actual voice and tone, not filler. Only the meta-complaint
  about repeating yourself gets removed.

The ceiling here is real: a sentence that vents in a way not covered by one
of these patterns won't get caught. This targets the common, recognizable
shapes, not every possible phrasing.

### Contract (unchanged, still enforced)

`compress.js` never removes: code fences/inline code, URLs, quoted strings,
file paths, or numbers. These are protected before any filler-stripping
runs and restored verbatim at the end (`protect()`/`restore()` in
`compress.js`). Single-quoted text is protected only when it's adjacent to
punctuation/whitespace on both sides, specifically so ordinary contractions
(`it's`, `don't`, `we'll`) aren't mistaken for quote delimiters and don't
get mangled or have real content between two unrelated apostrophes
swallowed. All of this is covered by `tests/compress.test.js`.

### Run the tests

```powershell
cd save-tokens
npm install
npm test
```

### CLI usage

```powershell
node cli.js < draft.txt > distilled.txt
```

## Browser extension (`extension/`)

Distills your draft 5 seconds after you stop typing in claude.ai's compose
box, and shows a banner with **Apply** / **Keep original** — it never
submits or overwrites anything without you clicking Apply.

**What changed from the original prototype:** the prototype set
`el.textContent` directly and dispatched a bare synthetic `InputEvent`.
Verified against a local harness reproducing a framework that gates edits
through `beforeinput` (the documented risk: claude.ai's compose box is a
rich contenteditable editor, not a plain textarea) — that approach changes
what's visually on screen while the framework's actual internal model, what
gets submitted on Enter, keeps the old text. `content.js` now drives edits
through `document.execCommand("insertText", ...)` after selecting the
existing content (a genuine native edit, not a raw node replacement), falls
back to a direct write with a properly-populated `InputEvent` if that's
unsupported or visibly no-ops, and reports back whether the visible DOM
ended up holding the intended text. If it can't confirm, it shows a second
banner telling you to check the compose box before sending — the failure
mode is a visible warning, never a silent wrong send.

Full methodology and the honest limitation (a content script can't
fabricate a trusted keystroke, so this can't be proven against a framework
with zero DOM/input-event fallback) is in `extension/VERIFICATION.md`.

`extension/compress.js` is a packaging copy of the canonical `compress.js`
(the extension can only load content scripts from inside its own
directory). Run `npm run sync-extension` after editing `compress.js`;
`tests/extension-sync.test.js` fails the build if the copy drifts.

The manifest is a single cross-browser `manifest.json` — no separate
Chrome/Firefox variants. It's plain manifest v3 with no background
script/service worker (content-script-only), which Firefox supports
natively, plus a `browser_specific_settings.gecko` block Chrome just
ignores. Verified with Mozilla's own linter, not assumed compatible:

```powershell
cd save-tokens/extension
npx web-ext lint --source-dir . --no-config-discovery
```

passes with 0 errors, 0 warnings (including the `data_collection_permissions`
key Firefox now requires — set to `"none"`, matching this project's
zero-telemetry constraint). This confirms the manifest and static code are
valid for Firefox; it does not replace the live-claude.ai DOM-behavior gap
in `extension/VERIFICATION.md`, which is about runtime editor behavior, not
manifest validity, and applies the same way in both browsers.

### Install — Firefox (unpacked, for testing)

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `save-tokens/extension/manifest.json`.
3. Open claude.ai, type a draft over 40 characters, wait 5 seconds idle.

This load is temporary — it's removed when Firefox restarts, and needs to
be re-loaded each session. For a permanent install you'd need to sign it
through addons.mozilla.org (self-distribution/unlisted signing is free);
not done here since that publishes it, however unlisted, to a real Mozilla
account, and that's a call to make deliberately, not a default in a repo
build.

### Install — Chrome (unpacked, for testing)

1. `chrome://extensions` → enable Developer mode → **Load unpacked** →
   select `save-tokens/extension/`.
2. Open claude.ai, type a draft over 40 characters, wait 5 seconds idle.

## AutoHotkey script (`ahk/`)

Ctrl+Alt+D in any text box: selects all, copies, runs the selection through
`cli.js`/`compress.js`, pastes the result back.

**Not executed on Windows** — this sandbox has no Windows host. It was
hardened based on the known risk called out in the original file (clipboard
timing on slower machines): the copy step now retries up to 4 times with
increasing backoff (100/300/600/1000ms) instead of a single `ClipWait`, and
there's a short settle delay before the original clipboard is restored
after paste, since restoring too eagerly is the other common source of
clipboard races. **Verify on a real machine before relying on it** —
specifically, confirm the hotkey doesn't conflict with anything already
bound to Ctrl+Alt+D, and that `ScriptDir` at the top of the script points to
wherever you actually put `cli.js`.

### Setup

```powershell
# Node.js must be on PATH
node --version

# Edit ScriptDir in save-tokens.ahk to point at this save-tokens/ directory,
# then double-click save-tokens.ahk (requires AutoHotkey v1 installed).
```
