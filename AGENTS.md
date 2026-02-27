# AGENTS.md

## 1. Interaction Protocol

Interaction must occur **exclusively via `ask_user`**, always:

- Iterative
- Interactive
- With no iteration limits

Each iteration must:

- Ask exactly **one clear question**
- Provide **5 options total**:
  - 3 structured options
  - 1 always-present `freeform` option
  - 1 always-present `Autonomous Mode` option
- Explicitly indicate which option is **the most future-proof**

### Mandatory Option Set

Each `ask_user` interaction must always include:

1. **Structured Option A**
2. **Structured Option B**
3. **Structured Option C**
4. **Freeform**
5. **Autonomous Mode**

### Autonomous Mode

`Autonomous Mode` means:

- Work autonomously until **all milestones are completed**
- Always choose the **best, most future-proof option** among the available alternatives
- Request feedback **only after all milestones have been completed**
- Ask for confirmation **only if strictly necessary**, especially for destructive, irreversible, or high-risk actions

Confirmation for destructive actions should be requested only when truly necessary.

The interaction loop stops **only** when the user explicitly states:

> "sono soddisfatto"

Until that exact statement is provided, the loop continues indefinitely.

---

## 2. Planning & Continuous Tracking

A `plan` must always be:

- Created before execution
- Continuously updated
- Accompanied by a concise progress summary after each update

### Mandatory Plan Format (Zod JSON Structure)

```json
plan: {
  PRD: "string",
  context: "string",
  milestones: {
    "m1": {
      id: "m1",
      description: "milestone description",
      issues: {
        "i1": {
          id: "i1",
          task: "task description",
          priority: "high | medium | low",
          depends_on: ["i0"],
          children: {}
        }
      }
    }
  }
}
```

### Structural Rules

- Milestones and issues are hierarchical.
- The structure must enable parallel work when possible.
- Each milestone must have a unique `id`.
- Each issue must have a unique `id`.
- Every issue must explicitly declare dependencies using `depends_on`.
- Issues may contain nested child issues.
- The dependency graph must allow safe parallelization.

---

## 3. Session Logging

For each working session, create or update:

```text
sessions-<ISO-date>.md
```

### Format

```md
# Session <ISO date>

Milestones:
- m1
- m2

Issues:
- i1
- i2

Work Summary:
<concise structured summary>

Date:
<ISO timestamp>
```

Session logging is mandatory and must accurately reflect progress.

---

## 4. Git Workflow

For every milestone or major phase:

- Create a dedicated branch or git worktree
- Naming must align with milestone or issue IDs
- Maintain traceability between branches, milestones, and issues

If unexpected architectural or structural changes emerge:

- Stop immediately
- Use `ask_user` before proceeding

No unapproved structural deviation is allowed.

---

## 5. Architectural Principles

Always apply:

- KISS
- DRY
- SOLID
- Hexagonal Architecture (Ports & Adapters)

Strict constraints:

- No workarounds
- No temporary patches
- No short-term fixes
- No uncontrolled technical debt
- No destructive actions unless necessary

Only definitive, scalable, long-term solutions are allowed.

All implementations must be architecturally optimal and future-proof.

---

## 6. Future-Proof Strategy

Every decision must:

- Maximize extensibility
- Minimize technical debt
- Preserve architectural coherence
- Support long-term system evolution
- Avoid tactical shortcuts
- Be production-grade by design

Workaround-based solutions are strictly prohibited.

---

## 7. Subagent Orchestration

Use `Fleet` to deploy and coordinate subagents whenever it improves execution quality, efficiency, or separation of concerns.

Subagents must be considered when:

- Work can be parallelized safely
- Responsibilities can be isolated clearly
- A task requires specialized analysis or implementation
- Independent workstreams reduce execution time
- A milestone or issue can be delegated without breaking dependency constraints

`Fleet` is used exclusively for subagent orchestration, not as a generic execution mode.

All subagent activity must remain aligned with:

- The current plan
- Milestone and issue dependencies
- Architectural principles
- The future-proof strategy

---

## 8. Document-First Approach

Before implementing any solution:

- Analyze official documentation
- Use:
  - context7 MCP
  - Web search when required

All decisions must be:

- Documentation-aligned
- Standards-compliant
- Evidence-based
- Verified before implementation

No implementation without prior documentation review.

---

## 9. Problem-Solving Framework

When a problem arises:

1. Perform structured root cause analysis
2. Identify the optimal long-term solution
3. Validate against architectural principles
4. Implement cleanly
5. Execute feedback loop
6. Fine-tune

If progress stalls:

- Change strategy
- Reassess assumptions
- Avoid technical stubbornness
- Do not persist with ineffective approaches

The objective is full autonomous resolution while preserving architectural integrity, scalability, and long-term system quality.
