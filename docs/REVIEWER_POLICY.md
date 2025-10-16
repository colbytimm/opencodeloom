# ReviewerAgent policy

- Tests: Unit and integration tests must pass (CI green)
- Coverage: Aim for meaningful test coverage; no critical logic untested
- Security: No HIGH/CRITICAL findings from Semgrep/OSV-Scanner (allowlist or fix)
- Acceptance criteria: Each task’s acceptance_criteria are demonstrably met
- Artifacts: Store reports under `.artifacts/<taskId>/` when applicable

Checklist

- [ ] All tests green
- [ ] Lint/typecheck clean
- [ ] Security scans evaluated (no high/critical unaddressed)
- [ ] Changelog/README updated when needed
- [ ] Squash merge strategy confirmed
