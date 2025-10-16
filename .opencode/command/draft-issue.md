---
description: Guided issue authoring
agent: plan
tools:
  listrepositories: true
  getrepository: true
---
# /draft-issue

Guide the user to produce a clear issue that /kickoff can convert into a task graph.

## What to gather (ask, then synthesize)

- Problem and desired outcome (1–3 sentences)
- Acceptance criteria (3–7 bullets, testable, binary pass/fail)
- Repos involved (optional tags; validate)
- Constraints (time, tech, security, compatibility)
- Risks and assumptions
- Out of scope
- Success metric (how we’ll verify)

## How to validate repos

- Use `listrepositories` to list known repos and metadata.
- If the user specifies tags, validate with `getrepository` and reflect resolved paths/names.

## Output

- ISSUE.md content with sections:
  - Title, Summary, Context
  - Acceptance criteria (numbered or bullets)
  - Out of scope
  - Constraints
  - Risks & assumptions
  - Repo tags (validated)
- A machine-friendly JSON block for /kickoff:

```json
{
  "acceptance_criteria": ["..."],
  "repo_tags": ["web", "api"],
  "constraints": ["..."],
  "risks": ["..."],
  "assumptions": ["..."]
}
```

## Notes

- Keep language specific and testable; avoid vague terms ("better", "clean up").
- If scope looks too large, suggest splitting into issues.
- Do not create a task graph here—/kickoff will derive it from the outputs above.
