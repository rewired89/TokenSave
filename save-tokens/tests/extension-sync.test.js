const fs = require("fs");
const path = require("path");

// extension/compress.js is a packaging copy of the canonical module (Chrome
// extensions can't load a content script from outside their own directory
// tree, so it can't just be required from ../compress.js). This test turns
// "must stay in sync" from a hope into something CI catches: run
// `npm run sync-extension` if it fails.
test("extension/compress.js is byte-identical to the canonical compress.js", () => {
  const canonical = fs.readFileSync(path.join(__dirname, "..", "compress.js"), "utf8");
  const extensionCopy = fs.readFileSync(path.join(__dirname, "..", "extension", "compress.js"), "utf8");
  expect(extensionCopy).toBe(canonical);
});
