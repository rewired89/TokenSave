// cli.js — reads a draft from stdin, prints the distilled version to stdout.
// Usage: node cli.js < draft.txt > distilled.txt
const { distill } = require("./compress.js");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  process.stdout.write(distill(input));
});
