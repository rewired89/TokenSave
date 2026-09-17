const { distill, estimateTokens } = require("../compress.js");

describe("filler removal + grammatical coherence", () => {
  test("strips a single filler phrase without leaving debris", () => {
    const out = distill("I was just thinking, could you please help me with this?");
    expect(out).toBe("Help me with this?");
  });

  test("drops a pure-filler opener sentence entirely", () => {
    const out = distill("Hi! Please fix the bug in the login form.");
    expect(out).toBe("Fix the bug in the login form.");
    expect(out).not.toMatch(/^hi/i);
  });

  test("collapses adjacent filler phrases without a double comma", () => {
    const out = distill("So, I think, actually, this endpoint is broken.");
    expect(out).toBe("This endpoint is broken.");
    expect(out).not.toMatch(/,\s*,/);
  });

  test("repairs a dangling leading connective left by filler removal", () => {
    const out = distill("By the way, I was just thinking, can you help me deploy this?");
    expect(out).not.toMatch(/^(By the way|,)/);
    expect(out).not.toMatch(/,\s*,/);
    expect(out.length).toBeGreaterThan(0);
    expect(/^[A-Z]/.test(out)).toBe(true);
  });

  test("does not rewrite a leading connective on a sentence filler removal never touched", () => {
    const out = distill("So there's a bug in the parser that needs fixing.");
    expect(out).toMatch(/^So /);
  });

  test("capitalizes the sentence start when the capitalized filler word was removed", () => {
    const out = distill("Just remove the temp file before you commit.");
    expect(out).toBe("Remove the temp file before you commit.");
  });

  test("multi-sentence draft reads as coherent prose, not just shorter", () => {
    const input =
      "Hey! I was just thinking, could you please take a look at the build? " +
      "Basically, actually, the CI is failing and I guess it's related to the cache. " +
      "Thanks so much!";
    const out = distill(input);
    expect(out).not.toMatch(/,\s*,/);
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).not.toMatch(/^[a-z]/);
    expect(out).not.toMatch(/\bjust\b|\bbasically\b|\bactually\b|\bi guess\b/i);
  });
});

describe("requirement preservation", () => {
  test("never removes a URL", () => {
    const out = distill(
      "I was just thinking, could you please check https://example.com/api/v2/users?id=42 for me?"
    );
    expect(out).toContain("https://example.com/api/v2/users?id=42");
  });

  test("never removes a double-quoted string", () => {
    const out = distill('Please rename the field "userId" to "user_id" everywhere.');
    expect(out).toContain('"userId"');
    expect(out).toContain('"user_id"');
  });

  test("never removes a code fence", () => {
    const input =
      "Could you please review this:\n```js\nfunction add(a, b) { return a + b; }\n```\nThanks!";
    const out = distill(input);
    expect(out).toContain("```js\nfunction add(a, b) { return a + b; }\n```");
  });

  test("never removes inline code", () => {
    const out = distill("Just run `npm install` before you start, please.");
    expect(out).toContain("`npm install`");
  });

  test("never removes numbers", () => {
    const out = distill("I think we need exactly 42 retries with a 3000ms timeout, please.");
    expect(out).toContain("42");
    expect(out).toContain("3000");
  });

  test("never removes a file path", () => {
    const out = distill("Could you please look at src/utils/helper.js and fix it?");
    expect(out).toContain("src/utils/helper.js");
  });

  test("preserves all protected content together in one draft", () => {
    const input =
      'I was just thinking — could you please check https://example.com/x, ' +
      'update "the config flag", run `npm test`, fix src/api/client.js, ' +
      "and confirm the timeout is 5000ms? Thanks so much!";
    const out = distill(input);
    expect(out).toContain("https://example.com/x");
    expect(out).toContain('"the config flag"');
    expect(out).toContain("`npm test`");
    expect(out).toContain("src/api/client.js");
    expect(out).toContain("5000");
  });
});

describe("near-duplicate collapsing", () => {
  test("collapses a near-duplicate restatement into one sentence", () => {
    const out = distill(
      "Please fix the login bug. Please fix the login bug so users can sign in."
    );
    expect(out).toBe("Fix the login bug.");
  });

  test("keeps two sentences that are not actually similar", () => {
    const out = distill("Fix the login bug. Deploy the staging environment.");
    expect(out).toContain("Fix the login bug.");
    expect(out).toContain("Deploy the staging environment.");
  });
});

describe("contraction vs. quoted-literal edge case", () => {
  test("leaves contractions intact instead of treating the apostrophe as a quote", () => {
    const out = distill(
      "It's ready, and I don't think we'll need more; here's the plan."
    );
    expect(out).toContain("It's");
    expect(out).toContain("don't");
    expect(out).toContain("we'll");
    expect(out).toContain("here's");
  });

  test("protects a single-quoted literal adjacent to punctuation verbatim", () => {
    const out = distill("Please set the 'exact-flag' option before running.");
    expect(out).toContain("'exact-flag'");
  });

  test("does not swallow real content between an apostrophe and a later one", () => {
    const out = distill(
      "It's broken because the user's session and the admin's session don't match."
    );
    expect(out).toContain("user's session");
    expect(out).toContain("admin's session");
    expect(out).toContain("don't match");
  });
});

describe("estimateTokens", () => {
  test("is a rough char/4 estimate", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(9))).toBe(3);
  });
});
