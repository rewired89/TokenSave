# save-tokens/extension

## compress.js
- `function protect(text)`
- `function restore(text, store)`
- `function splitSentences(text)`
- `function cleanupGrammar(sentence, fillerWasStripped)`
- `function similarity(a, b)`
- `function distill(rawText)`
- `function estimateTokens(text)`

## content.js
- `function getComposeElement()`
- `function getText(el)`
- `function setNativeValue(el, text)`
- `function setContentEditableValue(el, text)`
- `function setText(el, text)`
- `function showBanner(el, original, distilled)`
- `function showFailureNotice()`
- `function onActivity(e)`
