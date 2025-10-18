# Agentic Flow v2

This version mirrors the original flow while adding your repository-aware specialization, dependency auto-pickup, and security/CI details.

```mermaid
flowchart TD
  I[Issue Created - Human] --> D{Tech details & AC}
  D --> P[Plan Agent: decompose tasks, define deps, tag skills, tag repos]

  %% Repository awareness
  P --> LR[List Repositories: listrepositories]
  LR --> P
  subgraph repo_discovery[Repository Intelligence]
    direction LR
    LR2[List Repositories]
    GR[Get Repository: getrepository]
  end

  P --> TG[Task Graph]
  subgraph tasks
    direction LR
    T1[Task T1] --> T2[Task T2]
    T1 --> T3[Task T3]
    T2 --> T4[Task T4]
    T3 --> T5[Task T5]
  end
  TG --> T1
  TG --> T2
  TG --> T3
  TG --> T4
  TG --> T5

  %% Implementers discover specialization from repositories
  subgraph implementers[Dev Agents]
    direction LR
    A1[Dev Agent A1]
    A2[Dev Agent A2]
    A3[Dev Agent ...]
  end
  A1 --> GR
  A2 --> GR
  A3 --> GR
  GR --> A1
  GR --> A2
  GR --> A3

  %% Dependency-driven pickup
  G{No dep or dep complete?}
  T1 --> G
  T2 --> G
  T3 --> G
  T4 --> G
  T5 --> G

  G -- Yes --> WT[Create git worktree + branch\nissue-<id>/feature-<slug>\nPull latest main by default]
  WT --> IMP[Implement change + unit tests]

  IMP --> A1
  IMP --> A2
  IMP --> A3

  A1 --> INTEG[Implement integration tests]
  A2 --> INTEG
  A3 --> INTEG

  LINT[Run lint/typecheck]
  IMP --> LINT
  INTEG --> LINT

  subgraph qa_agents[QA Agents]
    direction LR
    Q1[QA Agent 1]
    Q2[QA Agent 2]
    Q3[QA Agent ...]
  end

  INTEG --> Q1
  INTEG --> Q2
  INTEG --> Q3

  %% Security runs both pre-PR and on PR
  S[SecurityAgent: Semgrep + OSV-Scanner]
  IMP --> S
  INTEG --> S
  LINT --> S
  S -- Vulnerability found --> IMP

  CQ[CodeQualityAgent]
  R[ReviewerAgent]
  Q1 --> CQ
  Q2 --> CQ
  Q3 --> CQ
  S --> CQ
  LINT --> CQ
  CQ --> R
  R -- Requests changes --> IMP

  R -- Approved --> MR[Open PR]
  MR --> MRG[Squash merge to main]
  MRG --> CLOSE[Close Issue]
```

Notes

- Issues are human-authored initially; automation can be added later at the intake node.
- Plan Agent uses listrepositories to tag repos and skills; implementers call getrepository to determine specialization.
- Tasks carry explicit dependency tags so agents can auto-pick up when dependencies complete.
- Worktree tool creates branches with `issue-<id>/feature-<slug>` and pulls latest `main` by default.
- Security runs both pre-PR and on PR using Semgrep and OSV-Scanner (via local runner or CI of your choice).
- Code Quality agent runs before Reviewer to enforce linting and repository patterns.
- Reviewer is an agent; merge strategy is squash.
