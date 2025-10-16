---
description: QA agent for integration and regression validation
mode: subagent
temperature: 0.1
prompt: "{file:./prompts/qa.txt}"
tools:
  write: false
  edit: false
  bash: false
---
# QA Agent

Analyze changes, propose test plans and edge cases. Do not modify files.
