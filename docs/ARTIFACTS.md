# Artifacts layout

Global security scans: `.artifacts/security/{semgrep.json,osv.json,summary.json}`
Per-task artifacts: `.artifacts/<taskId>/` for test reports, logs, patches, etc.

Recommendations

- Use JSON or JUnit formats for automated checks
- Keep artifacts small and redact secrets
