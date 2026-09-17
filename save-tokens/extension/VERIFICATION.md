# content.js — verification notes

The original prototype set `el.textContent` directly on the compose element
and dispatched a synthetic `InputEvent`. That was never run against a real
contenteditable framework. This directory's `content.js` was rewritten and
the rewrite was verified against a local Playwright harness — not against
the live claude.ai site, since that requires an authenticated browser
session this sandboxed environment cannot reach. The gap between "verified
against a comparable local page" and "verified against claude.ai itself" is
real and stated here rather than glossed over.

## What was tested

Two local HTML pages, each a contenteditable `<div>` with its own JS "model"
of what the editor would actually submit, separate from the raw DOM (the
exact divergence the task asked to check for):

- **`editor.html`** — worst case. Updates its model only from `beforeinput`,
  `preventDefault()`s everything else, and has no fallback. This is a strict
  stand-in for a framework that trusts nothing but native `beforeinput`.
- **`editor-hybrid.html`** — realistic case. Same `beforeinput` path, plus a
  `MutationObserver` fallback that reconciles the model from whatever
  actually landed in the DOM. This mirrors the documented architecture of
  frameworks like Lexical, which don't rely on `beforeinput` alone (it isn't
  reliably fired for every kind of edit across browsers/input methods).

Three approaches were run against both, via Playwright + the pre-installed
Chromium, and against the actual shipped `content.js` file (not a
reimplementation — loaded with `page.addScriptTag`):

| Approach | `editor.html` (strict) | `editor-hybrid.html` (realistic) |
|---|---|---|
| `el.textContent =` + synthetic `InputEvent` (original prototype) | **Fails.** Visible text changes; the model — what gets sent — keeps the old draft. | Passes. |
| `document.execCommand("insertText", ...)` (this rewrite's primary path) | **Fails**, for a reason worth calling out below. | Passes. |
| Real content.js `setText()` (execCommand, falls back to direct write, returns a confirmed/not-confirmed boolean) | Confirms visible-DOM success, but the model still fails | Passes, `setText()` returns `true`. |

The failing runs are the important result, not a footnote: the visible text
in the compose box can look correct while the framework still submits the
old draft on Enter. That's the exact risk the task asked to check for, and
it's real for at least one plausible editor architecture.

## Why `execCommand` was still the right fix

It was expected to outperform a raw property write; that specific claim
turned out to be more nuanced. Chromium in this environment does not fire
`beforeinput` at all for `execCommand("insertText", ...)` — only a plain
`input` event (confirmed via an event-logging test: `beforeinput` never
fires; `input` fires with `isTrusted: true`, `inputType: "insertText"`,
`data` set correctly). So against the strict `editor.html` model, it fails
for the same underlying reason the naive write does: neither goes through a
`beforeinput` handler.

It's still the better choice over a raw `.textContent =` write, for reasons
that don't show up in the pass/fail table:

- It performs a genuine native contenteditable edit (proper selection
  handling, a real DOM mutation any `MutationObserver`-based reconciliation
  will see), instead of blowing away and replacing every child node, which
  can break a framework's held references to those nodes.
- The resulting `input` event carries a correct `inputType` and `data`
  rather than an empty synthetic event — confirmed directly with an
  event-logging test page. A framework that inspects those fields during
  reconciliation gets real information instead of nothing.
- Verified separately for the `<textarea>`/`<input>` case (not what
  claude.ai uses, but the same content script may run against other pages
  where it hits a plain textarea): a bare `el.value = x` fires **no event at
  all**, confirmed empirically. `setText()`'s native-setter approach (call
  the real `value` setter via `Object.getOwnPropertyDescriptor`, then
  dispatch a proper `InputEvent`) does fire a correctly-populated `input`
  event — this is the standard, widely-documented workaround for React's
  input value tracking.

## The honest limitation

A content script cannot fabricate a fully browser-trusted keystroke. No
technique available to one can be proven to update a framework's internal
model when that framework trusts only native `beforeinput` and has no
DOM-mutation or `input`-event fallback. Every mainstream rich-text framework
checked in public documentation (React, Lexical, ProseMirror, Slate)
includes such a fallback — which is why the `execCommand` + readback
approach is expected to work in practice — but "expected to work based on
how these frameworks are documented to behave" is not the same claim as
"verified against claude.ai," and this file does not claim the latter.

## The safety net this leaves in place

`setText()` returns whether the **visible DOM** ended up holding the
intended text — the strongest signal available from a content script, even
though it can't confirm the framework's internal state matches. `content.js`
never auto-submits: it shows a banner with explicit Apply/Keep-original
buttons, and if the post-apply readback doesn't match, a second banner tells
the user it couldn't confirm the change and to check the compose box before
sending. Worst case is a visible warning, never a silently wrong send.

## Reproducing this

The harness pages and Playwright scripts used for this table are not
checked into the repo (they're throwaway local fixtures, not part of the
shipped product). To re-verify: build two local HTML pages as described
above, load `extension/content.js` into them with Playwright's
`page.addScriptTag`, call `window.setText(el, text)`, and compare what the
page's own model records as "sent" against the intended text.
