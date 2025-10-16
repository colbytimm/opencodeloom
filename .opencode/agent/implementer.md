---
description: Implements scoped tasks with tests
mode: subagent
temperature: 0.3
prompt: "{file:./prompts/implementer.txt}"
tools:
    write: true
    edit: true
    bash: true
    grep: true
    list: true
    patch: true
permission:
    bash:
        "git push": ask
        "*": allow
---
# Implementer Agent

Implement according to the Task Graph. Prefer tests-first; keep changes minimal and self-contained.
