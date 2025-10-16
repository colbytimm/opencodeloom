# Release process (lightweight)

- Versioning: bump `package.json` version with semver.
- Tagging: create a git tag `vX.Y.Z`.
- Changelog: summarize notable changes in the PR description or a `CHANGELOG.md` (optional).
- Testing: run `npm run typecheck && npm test` locally. Integration tests may require Node native module alignment for `better-sqlite3`.
- Security: scan locally with your preferred tools (Semgrep/OSV).
