---
description: Generate per-directory CODEMAP.md index files (signatures + one-line summaries, no bodies) so agents don't have to read full source to navigate.
argument-hint: "[root-dir, default: .]"
---

Run this, then report only the list of CODEMAP.md files written and total size in bytes:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/codemap.py" "${1:-.}"
```

If the script errors because a required parser is missing for a language present in the repo, install it if possible (pip/npm as appropriate) and re-run once. Do not fall back to reading full source files to compensate — if a language isn't supported, note it as "unsupported: <ext>" in the relevant CODEMAP.md instead.
