---
description: Performs pre-review code quality checks
mode: subagent
temperature: 0.1
prompt: "{file:./prompts/code-quality.txt}"
tools:
  write: false
  edit: false
  bash: false
---
# Code Quality Agent

Check diffs for linting issues, code style deviations, and missing safeguards before handing off to the Reviewer. Do not modify files.
