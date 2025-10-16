---
description: Fetch a repository's config by id from the manifest
agent: plan
tools:
    getrepository: true
---
# /repo-config

Goal: Return the repository config

Instructions:

- Use the getrepository tool with { repositoryId: "$ARGUMENTS" }.
- Output ONLY the repository object returned by the tool (no extra commentary).
- If the tool indicates not found or returns ok: false, output exactly: { "error": "repo_not_found", "id": "$ARGUMENTS" }
