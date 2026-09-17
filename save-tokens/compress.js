// compress.js — pure function, no dependencies, runs entirely client-side.
// Goal: shrink token count of the user's OWN draft before submission,
// without ever touching content that looks load-bearing.

const FILLER_PHRASES = [
  /\bi was (just )?thinking\b/gi,
  /\bi (just )?wanted to (say|mention|ask)\b/gi,
  /\bif (it'?s )?possible\b/gi,
  /\bif you (could|can)\b/gi,
  /\bwould you mind\b/gi,
  /\bcould you (please )?\b/gi,
  /\bcan you (please )?\b/gi,
  /\bplease\b/gi,
  /\bjust\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bi guess\b/gi,
  /\bi think\b/gi,
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\bby the way\b/gi,
  /\bto be honest\b/gi,
  /\bfeel free to\b/gi,
  /\bwhen you get (a )?chance\b/gi,
  /\bno rush\b/gi,
  /\bsorry (to bother( you)?( with (this|that|it))?|for asking)\b/gi,
  /\bthanks (so much|in advance)?\b/gi,
  /\bthank you\b/gi,

  // Venting about having to repeat yourself wraps a real instruction in
  // frustration text that carries no requirement of its own — the
  // instruction is what follows "tired of telling you to X", not the
  // venting. These target that wrapper specifically, not general profanity
  // or emphasis, which stay untouched (that's the user's actual voice, not
  // filler).
  /\b(?:(?:because|cause)\s+)?i'?m (?:so |really )?(?:tired|sick) of (?:telling|having to tell) you to\b/gi,
  /\bi keep (?:having to |needing to )?(?:tell|telling) you to\b/gi,
  /\bhow many times (?:do i have to|will i have to) (?:say|tell you) this\b/gi,
  /\bfor the (?:last|hundredth|millionth) time\b/gi,
  /\bi'?ve told you (?:this )?(?:before|already|a million times)\b/gi,
  // A trailing complaint clause about the behavior repeating, once the
  // actual instruction has already been stated, adds nothing new.
  /,?\s*and you keep (?:fucking |literally )?doing (?:it|this)\b/gi,
  // Narrow on purpose: "stop THAT/THIS bullshit/shit/nonsense/crap" is a
  // vague complaint, never a real instruction (a real one names the thing
  // to stop). A bare "stop X" is left alone since X is usually the
  // instruction itself.
  /,?\s*stop (?:that|this|the) (?:bullshit|shit|nonsense|crap)\b/gi,
];

// Sentences that are 100% filler and carry no requirement — drop entirely.
const PURE_FILLER_SENTENCE = /^\s*(hi|hey|hello|thanks|thank you|cheers|hope (you're|this) (doing well|finds you well)|just checking in|stop (that|this|the) (bullshit|shit|nonsense|crap)|this is ridiculous|i'?m (so |really )?(tired|sick) of this)[.!]?\s*$/i;

// Protect anything that must survive verbatim: code fences, inline code,
// URLs, file paths, quoted strings, numbers-with-units.
const PROTECT_PATTERNS = [
  /```[\s\S]*?```/g,
  /`[^`]+`/g,
  /https?:\/\/\S+/g,
  /(?:[\w.-]+\/)+[\w.-]+\.\w+/g, // path-like
  /"[^"]*"/g,
  // Single quotes are deliberately NOT protected here: English contractions
  // (it's, don't, I'll) contain bare apostrophes and a naive '[^']*' match
  // will swallow everything between an apostrophe and the next one anywhere
  // in the text, silently disabling compression on real content. If you need
  // single-quoted literals protected, require them adjacent to punctuation:
  /(?<=[\s([{:,]|^)'[^'\n]{1,80}'(?=[\s)\]}.,!?]|$)/g,
];

// A NUL character can't appear in normal prose, which is exactly why it's
// used as the placeholder delimiter below. Built via fromCharCode (not typed
// directly in source) so the .js file itself stays plain ASCII/UTF-8 text
// instead of carrying a raw control byte that confuses diffs and greps.
const PLACEHOLDER_CHAR = String.fromCharCode(0);
const PLACEHOLDER_RE = new RegExp(`${PLACEHOLDER_CHAR}(\\d+)${PLACEHOLDER_CHAR}`, "g");

function protect(text) {
  const store = [];
  let out = text;
  for (const pattern of PROTECT_PATTERNS) {
    out = out.replace(pattern, (match) => {
      store.push(match);
      return `${PLACEHOLDER_CHAR}${store.length - 1}${PLACEHOLDER_CHAR}`;
    });
  }
  return { out, store };
}

function restore(text, store) {
  return text.replace(PLACEHOLDER_RE, (_, i) => store[Number(i)]);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Repair the grammatical debris that filler-phrase removal leaves behind:
// doubled/orphaned commas, dangling leading connectives, stray punctuation,
// and a lowercase sentence-start where the capitalized word got stripped.
const CONNECTIVE_WORDS = "and|so|but|well|also|oh|um|uh|now|anyway|anyways|because|cause|since";
const LEADING_CONNECTIVES = new RegExp(`^(${CONNECTIVE_WORDS})\\b[,.]?\\s*`, "i");
// A single connective word stranded between two commas ("Hey, so , help") is
// what's left when the clause the connective introduced got removed as
// filler but the connective itself, being real English, did not.
const SANDWICHED_CONNECTIVE = new RegExp(`,\\s*\\b(${CONNECTIVE_WORDS})\\b\\s*,`, "gi");
// After cleanup a sentence can end up as nothing but a bare connective
// ("And!") when the clauses on both sides of it were pure filler — that's
// not a sentence, it's debris, so it's dropped downstream (see distill()).
const ONLY_CONNECTIVE = new RegExp(`^(${CONNECTIVE_WORDS})[.,!?;:]*$`, "i");

function cleanupGrammar(sentence, fillerWasStripped) {
  let s = sentence;

  // A connective sandwiched between two commas with nothing else is debris,
  // regardless of whether this particular sentence had filler removed —
  // it only ever arises from a removed clause, never from real prose.
  s = s.replace(SANDWICHED_CONNECTIVE, ", ");

  // Collapse a run of commas/semicolons (possibly separated by whitespace)
  // left behind when two adjacent filler phrases were both stripped.
  s = s.replace(/\s*[,;]\s*(?:[,;]\s*)+/g, ", ");

  // A comma (or semicolon) directly before terminal punctuation is debris.
  s = s.replace(/\s*[,;]\s*([.!?])/g, "$1");

  // A comma (or semicolon) immediately after an opening bracket/quote is debris.
  s = s.replace(/([([{"'])\s*[,;]\s*/g, "$1");

  // Strip whatever punctuation/space debris is left at the very start.
  s = s.replace(/^[\s,;:]+/, "");

  // Drop a dangling leading connective ("And, ", "So, ", "Well, ") that filler
  // removal orphaned — but only on sentences filler removal actually touched,
  // so a sentence the user wrote starting with "So" untouched by compression
  // isn't rewritten for style. Never hollow out a sentence that was nothing
  // but the connective itself.
  if (fillerWasStripped) {
    const withoutConnective = s.replace(LEADING_CONNECTIVES, "");
    if (/[a-zA-Z0-9]/.test(withoutConnective)) s = withoutConnective;

    // Re-run comma cleanup: removing the connective can re-expose a comma
    // that is now leading ("And, , can you help?" -> ", can you help?" -> "can you help?").
    s = s.replace(/^[\s,;:]+/, "");
  }

  // Normalize remaining internal whitespace before punctuation and generally.
  s = s.replace(/\s+([.,!?;:])/g, "$1");
  s = s.replace(/\s{2,}/g, " ").trim();

  // Filler-stripping can leave a lowercase word at the start of the sentence
  // where the original capitalized word ("Just", "Please", ...) was removed.
  s = s.replace(/^[a-z]/, (c) => c.toUpperCase());

  return s;
}

// Jaccard similarity over word sets — cheap near-duplicate detector.
function similarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size);
}

function distill(rawText) {
  const { out: protectedText, store } = protect(rawText);
  let sentences = splitSentences(protectedText);

  sentences = sentences.filter((s) => !PURE_FILLER_SENTENCE.test(s));

  sentences = sentences
    .map((s) => {
      let cleaned = s;
      for (const pattern of FILLER_PHRASES) cleaned = cleaned.replace(pattern, "");
      const fillerWasStripped = cleaned !== s;
      return cleanupGrammar(cleaned, fillerWasStripped);
    })
    // A sentence that was 100% filler collapses to punctuation-only debris,
    // or a bare leftover connective, after cleanup — drop it instead of
    // joining a stray "." or "And!" onto the output.
    .filter((s) => (/[a-zA-Z0-9]/.test(s) || s.includes(PLACEHOLDER_CHAR)) && !ONLY_CONNECTIVE.test(s));

  const deduped = [];
  for (const s of sentences) {
    const isDup = deduped.some((prev) => similarity(prev, s) > 0.8);
    if (!isDup) deduped.push(s);
  }

  const joined = deduped.join(" ").replace(/\s{2,}/g, " ").trim();
  return restore(joined, store);
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4); // rough, provider-agnostic estimate
}

// Works both as a Node module (testing) and a plain content-script global
// (browser, no module system available in a classic content script).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { distill, estimateTokens };
} else {
  window.__saveTokens = { distill, estimateTokens };
}
