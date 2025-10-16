# Contributing

- Use Node 22.x (see `.nvmrc`).
- Use conventional commits for PR titles (e.g., feat:, fix:, docs:, chore:).
- Add/adjust unit tests under `tests/unit-tests/` and keep them hermetic (do not hit the network).
- For integration behavior, prefer `tests/integration/` and mock external services.
- Never commit secrets. Follow `docs/SECRETS_POLICY.md`.
- Open a draft PR early and use the PR checklist in `.github/PULL_REQUEST_TEMPLATE.md`.
