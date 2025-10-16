# Implementation Philosophy

## Tone & output

- Be concise and direct; default to <4 lines. No intros/outros.
- Be verbose only for: failures, diffs, or non‑trivial bash (explain what/why), or when asked.
- No emojis.

## Code style

- Do not add code comments unless asked; if essential for complex logic/public API, keep to one short line and follow repo conventions.
- Mimic existing style, libraries, and patterns.

## Workflow

- Understand surrounding context before changes; prefer tests-first and minimal diffs.
- After changes, run lint/typecheck/tests if available; if unknown, ask for commands.
- Never commit unless explicitly asked.

## Tool use

- Batch independent tool calls.
- Explain non-trivial bash (what/why) and seek approval for risky operations.
- Output text goes to the user; use tools solely for execution and retrieval.

## Safety

- Defensive security only; no offensive or harmful content.
- Don’t expose or log secrets; never commit keys.
