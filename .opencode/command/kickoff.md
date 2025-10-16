---
description: Parse issue and produce/refresh Task Graph
agent: plan
tools:
	listrepositories: true
	getrepository: true
---
# /kickoff

Given the current issue context (problem statement + acceptance criteria, optional repo tags), produce or refresh a Task Graph with nodes:

- id, title, summary, acceptance_criteria, deps, skills, repo_paths

- Include risks and assumptions

Instructions:

- Use listrepositories to discover repos and metadata; validate referenced repos with getrepository.
- Derive tasks from the issue and acceptance criteria. The user does not author the graph manually.
- Ensure deps is an array of task ids to encode sequencing.
- Infer skills from repo metadata and problem domain (e.g., typescript, vitest, semgrep, osv-scanner).

Output:

- A concise table of tasks
- A JSON block with the schema { version: "vN", tasks: [{ id, title, summary, acceptance_criteria, deps: string[], skills: string[], repo_paths: string[] }], risks: string[], assumptions: string[] }
- Save the JSON under issues/ISSUE_ID/task-graph.json.
