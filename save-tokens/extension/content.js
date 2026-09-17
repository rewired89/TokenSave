// content.js
//
// VERIFIED FINDING (Playwright, see save-tokens/extension/VERIFICATION.md):
// claude.ai's compose box is a rich contenteditable editor, not a plain
// <textarea>. A raw `el.textContent = text` write plus a synthetic
// `dispatchEvent(new InputEvent("input"))` changes what's visually on
// screen but does NOT reach a framework's internal document model when
// that framework gates edits through `beforeinput` interception and has no
// DOM-mutation-based fallback — confirmed empirically against a harness
// reproducing that architecture: the visible text showed the distilled
// draft while the value the app would actually submit stayed the original.
//
// setText() below instead drives the edit through
// `document.execCommand("insertText", ...)` after selecting the existing
// content, so the browser's native contenteditable editing pipeline
// performs a genuine edit (proper selection handling, a real DOM mutation
// any MutationObserver-based reconciliation will see, and a correctly
// populated `input` event with inputType/data set) rather than us silently
// replacing node content out from under the framework. It falls back to a
// direct write, with a well-formed InputEvent, if execCommand isn't
// supported or visibly no-ops.
//
// KNOWN LIMITATION, stated plainly: a content script cannot fabricate a
// fully browser-trusted keystroke, so no technique available here can be
// proven to update a framework's internal model when that framework
// exclusively trusts native `beforeinput` and has no fallback reconciliation
// path (no MutationObserver, no `input`-event-based sync) — this was
// confirmed as a real failure mode in the same harness. Every mainstream
// rich-text framework we're aware of (React, Lexical, ProseMirror, Slate)
// does include such a fallback, which is why this approach is expected to
// work in practice, but it was NOT possible to verify against the live,
// authenticated claude.ai session from this environment, which has no
// browser-login access. The safe failure mode below (banner + explicit
// Apply button, readback verification, never a silent auto-submit swap)
// means the worst case is "banner says it couldn't confirm the change,"
// not "wrong text gets sent silently."

const IDLE_MS = 5000;
const MIN_CHARS = 40; // don't bother distilling short drafts

let timer = null;

function getComposeElement() {
  return document.querySelector('textarea, [contenteditable="true"]');
}

function getText(el) {
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.textContent;
}

function setNativeValue(el, text) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
  // React (and similar frameworks) override the plain `.value` setter on
  // input/textarea elements to track changes; calling the native setter
  // through its prototype bypasses that override so the framework's own
  // change-tracking still fires correctly off the subsequent 'input' event.
  nativeSetter.call(el, text);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function setContentEditableValue(el, text) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  let applied = false;
  try {
    if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
      applied = document.execCommand("insertText", false, text);
    }
  } catch {
    applied = false;
  }

  if (!applied || el.textContent !== text) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
}

// Returns true if the visible DOM ended up holding the intended text. This
// confirms what's on screen, not the framework's internal state — the
// closest verification available from a content script (see the file-level
// comment above for why that gap can't be closed from here).
function setText(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    setNativeValue(el, text);
  } else {
    setContentEditableValue(el, text);
  }
  return getText(el) === text;
}

function showBanner(el, original, distilled) {
  const existing = document.getElementById("save-tokens-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "save-tokens-banner";
  banner.style.cssText =
    "position:fixed;bottom:80px;right:20px;z-index:99999;background:#1a1a1a;" +
    "color:#fff;padding:12px 16px;border-radius:8px;font:13px system-ui;" +
    "max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,.3);";

  const pct = Math.round((1 - distilled.length / original.length) * 100);

  // Built with createElement/textContent rather than innerHTML — nothing
  // here needs HTML parsing, and this avoids any injection surface even
  // though pct is just a number (flagged by Firefox's addons-linter as
  // UNSAFE_VAR_ASSIGNMENT on principle; fixing it outright is simpler and
  // safer than arguing it's fine this one time).
  const label = document.createElement("div");
  label.style.marginBottom = "8px";
  label.textContent = `Distilled draft ready — ~${pct}% shorter.`;

  const applyBtn = document.createElement("button");
  applyBtn.id = "st-apply";
  applyBtn.style.marginRight = "8px";
  applyBtn.textContent = "Apply";
  applyBtn.onclick = () => {
    const confirmed = setText(el, distilled);
    banner.remove();
    if (!confirmed) showFailureNotice();
  };

  const dismissBtn = document.createElement("button");
  dismissBtn.id = "st-dismiss";
  dismissBtn.textContent = "Keep original";
  dismissBtn.onclick = () => banner.remove();

  banner.append(label, applyBtn, dismissBtn);
  document.body.appendChild(banner);
}

function showFailureNotice() {
  const notice = document.createElement("div");
  notice.id = "save-tokens-failure";
  notice.style.cssText =
    "position:fixed;bottom:80px;right:20px;z-index:99999;background:#5a1a1a;" +
    "color:#fff;padding:12px 16px;border-radius:8px;font:13px system-ui;" +
    "max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,.3);";

  const label = document.createElement("div");
  label.textContent = "Couldn't confirm the compose box updated — please check its contents before sending.";

  const dismissBtn = document.createElement("button");
  dismissBtn.id = "st-failure-dismiss";
  dismissBtn.style.marginTop = "8px";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.onclick = () => notice.remove();

  notice.append(label, dismissBtn);
  document.body.appendChild(notice);
}

function onActivity(e) {
  const el = e.target.closest ? e.target.closest('textarea, [contenteditable="true"]') : null;
  if (!el) return;

  clearTimeout(timer);
  timer = setTimeout(() => {
    const text = getText(el);
    if (!text || text.length < MIN_CHARS) return;
    const { distill } = window.__saveTokens;
    const distilled = distill(text);
    if (distilled && distilled !== text && distilled.length < text.length) {
      showBanner(el, text, distilled);
    }
  }, IDLE_MS);
}

document.addEventListener("input", onActivity, true);
document.addEventListener("keyup", onActivity, true);
