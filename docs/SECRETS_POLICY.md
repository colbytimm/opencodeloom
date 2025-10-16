# Secrets & Access Control

This repo runs agents locally. To avoid leaking sensitive data:

- Use a vault or your CI secret store for long-lived credentials. Do not hardcode secrets.
- For local dev, place ephemeral secrets in `.opencode/secrets/` (ignored by git), and reference them by key.
- Never print secrets in logs or audit artifacts.
- The orchestrator and tools must only accept secret keys and return values redacted by default.

## Local secret layout (optional)

```text
.opencode/
  secrets/
    GITHUB_TOKEN
    NPM_TOKEN
    allowlist.json
```

## Retrieval rules

- Allowed: reading a whole-file secret and injecting it into environment for a child process.
- Disallowed: writing secrets to console, commit history, or artifacts.
- Redaction: when a tool reports actions, show `****` instead of secret values.

### Allowlist

If `.opencode/secrets/allowlist.json` exists, only keys present in the JSON array may be requested by tools. This prevents accidental access to unapproved secrets during local experimentation.
