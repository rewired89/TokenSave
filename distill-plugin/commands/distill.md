---
description: Distill this conversation into a compact build-spec file for a coding agent to execute, discarding narration and dead ends.
argument-hint: "[output-path, default: .claude/specs/SPEC.md]"
---

You are compacting this entire conversation into a build-spec for a coding agent (possibly a different model, possibly a fresh session with zero memory of this chat). The agent reading it will NOT see this conversation. Nothing you know from this chat exists for it unless it's in the file.

Write the file to: ${1:-.claude/specs/SPEC.md}

Rules:
- Re-derive, don't transcribe. Read back over the conversation and extract only what survived: the final decisions, not the debate that produced them. If the user changed their mind twice, keep only where they landed.
- Drop all narration, pleasantries, exploratory dead ends, rejected approaches, and your own commentary. If a task was already completed and verified in this conversation, don't re-list it as a task — note it as done in one line, or omit it.
- Preserve exact technical values verbatim: names, paths, versions, flags, error strings, config keys, thresholds, URLs. Never paraphrase these.
- Order tasks by dependency, not by chat order.
- If something the agent will need is genuinely ambiguous or was never resolved, put it under "Open questions" instead of guessing.

Output this exact structure:

```markdown
# <one-line objective>

## Decisions (locked — do not re-litigate)
- <constraint or choice already made, with the concrete value>

## Tasks
1. [ ] <imperative task> — files: <path(s)> — done when: <acceptance check>
2. [ ] ...

## Out of scope
- <explicitly excluded, so the agent doesn't wander>

## Open questions
- <anything unresolved the agent must ask about before proceeding, or "none">

## Context pointers
- <path or resource> — <one line on why it's relevant> (do not inline file contents; point at them)
```

Target length: whatever the actual content needs, but if a section would just restate another section, cut it. This file replaces re-reading the conversation — a coding agent should be able to work from it alone.

After writing the file, output nothing except the file path and a token-count estimate of the spec vs. the original conversation (rough char/4 estimate is fine).
