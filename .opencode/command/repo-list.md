---
description: List all repositories and their basic metadata
agent: plan
tools:
  listrepositories: true
---
# /repo-list

Goal: Output a concise table for all repositories

Instructions:

- Invoke the listrepositories tool (no arguments).
- If it returns ok: false, output exactly: { "error": "repo_list_unavailable" } and stop.
- From the repositories array, render:
  - A Markdown table with headers based on the JSON object keys
