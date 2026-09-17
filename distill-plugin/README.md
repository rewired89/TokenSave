# distill

Two Claude Code slash commands. Neither calls an external API or a second
model — both just direct the current session's model to do the work with
existing context, which is why they save tokens instead of costing them.

## Status

Verified against a real Claude Code CLI instance in this repo (not just
schema-checked): the manifest was validated with `claude plugin validate`,
installed from a real local marketplace with `claude plugin install`, and
both commands were run in fresh, non-interactive sessions (`claude -p`).
`/codemap` produced a real `CODEMAP.md`; `/distill` correctly declined to
write a spec from a conversation with no real content, then produced a
correct `SPEC.md` (decisions, task, out-of-scope, context pointers all
present and accurate) once given one. `codemap.py`'s Python path is
accurate (`ast`-based); its JS/TS path is regex-based and best-effort,
flagging what it can't parse rather than guessing.

## /distill [output-path]

Run at the end of a planning/discussion conversation, before handing the
work to a coding agent (same session, fresh session, or a different model
entirely). Claude re-reads the conversation and writes a compact build-spec:

- locked decisions (so the next agent doesn't re-litigate them)
- an ordered task list with file targets and acceptance checks
- explicit out-of-scope items
- open questions instead of guesses
- pointers to relevant files/resources, not their contents

Default output: `.claude/specs/SPEC.md`. Hand that file to the next
session/model instead of the whole transcript.

## /codemap [root-dir]

Runs `scripts/codemap.py`, which walks the repo and writes one `CODEMAP.md`
per directory: every top-level function/class signature plus its one-line
docstring, no bodies. Python is parsed with `ast` (accurate); JS/TS/JSX/TSX
with regex (best-effort — flags itself when it can't parse something).
Anything else is skipped, not read in full to compensate.

Re-run after structural changes; it's a flat overwrite, not incremental yet.

## Install

The plugin manifest lives at `distill-plugin/.claude-plugin/plugin.json`
(the canonical location Claude Code's manifest loader checks — a bare
`plugin.json` at the plugin root is not what gets validated). This repo's
root also carries `.claude-plugin/marketplace.json`, which lists this
plugin, so the whole repo can be added as a marketplace directly:

```
claude plugin marketplace add /path/to/TokenSave
claude plugin install distill@tokensave
```

or, once pushed:

```
claude plugin marketplace add rewired89/tokensave
claude plugin install distill@tokensave
```

To sanity-check the manifest without installing anything:

```
claude plugin validate distill-plugin --strict
```

## Known gaps (next to build, not done)

- codemap.py: no incremental caching (aider/Code Compass do this — worth
  porting their mtime+hash approach instead of re-inventing it)
- codemap.py: no PageRank/import-graph ranking yet — every symbol is listed,
  not just the ones other files actually call
- distill: no schema validation on the written SPEC.md — it's a prompt
  contract, not enforced structure. A JSON Schema + a `--strict` re-ask
  loop would close this.
- no Stop/SessionEnd hook variant yet — currently manual-invoke only, which
  is deliberate (avoids silently burning tokens every turn) but means you
  have to remember to run it.
