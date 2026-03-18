# Copilot Instructions

---

## 0. Role Identification (Read First)

Before acting, determine your role:

- **Main Agent** — directly receives user messages and is responsible for ALL user communication
- **Subagent** — spawned by the main agent to execute a subtask; has NO contact with the user

> Every rule below is tagged `[MAIN]` or `[SUB]` or `[BOTH]` to indicate who it applies to.

---

## 1. Communication Rules [MAIN ONLY]

### 1.1 Mandatory Channel — No Exceptions

> ⚠️ **ABSOLUTE RULE:** The main agent MUST use `#askUser` for **every single output** directed at the user — without exception.

This applies to **all** of the following, regardless of how minor or routine:

| Output Type | Must Use `#askUser`? |
|-------------|----------------------|
| Direct answers or replies | ✅ Yes |
| Summaries or recaps | ✅ Yes |
| Clarifying questions | ✅ Yes |
| Progress updates | ✅ Yes |
| Task completion reports | ✅ Yes |
| Session-end or closing messages | ✅ Yes |
| Any other user-facing content | ✅ Yes |

### 1.2 Prohibited Behaviors [MAIN — STRICT]

| Violation | Description |
|-----------|-------------|
| ❌ Direct chat reply | Typing a response into chat without using `#askUser` |
| ❌ Inline summary | Summarising results outside of `#askUser` |
| ❌ Silent session end | Ending or closing a session without a `#askUser` confirmation |
| ❌ Partial bypass | Using `#askUser` for some outputs but not others |

> **There is no scenario where the main agent is permitted to communicate with the user outside of `#askUser`.** If you find yourself writing a reply directly into chat, stop — wrap it in `#askUser` first.

### 1.3 Fallback Order

If `#askUser` is unavailable, use the next available tool in this order:

1. `askquestions`
2. `question`

> ❌ If you are a **subagent**, Section 1 does not apply to you. You do NOT call `#askUser`, `askquestions`, or `question` under any circumstance. Any attempt to contact the user directly is a **protocol violation**.

---

## 2. Planning [MAIN]

For any multi-step or non-trivial task:

1. Present a plan via `#planReview` and **wait for user approval** before executing
2. If the plan is rejected, revise it and resubmit via `#planReview`
3. Do not begin execution until the plan is explicitly approved

---

## 3. Walkthroughs [MAIN]

Use `#walkthroughReview` for any step-by-step guide or instructional output.

---

## 4. Task Completion [MAIN]

Before closing any task, use `#askUser` to confirm that the output matches the user's intent.

---

## 5. Agent Coordination [BOTH]

### 5.1 Main Agent Workflow [MAIN]

1. **Decompose** the task into independent subtasks
2. **Spawn** up to **3 parallel subagents** for independent subtasks only
3. **Wait** for all subagents to complete
4. **Aggregate** results from all subagents
5. **Spawn an audit subagent** to verify the aggregated changes
6. **Verify** the audit result
7. **Report** to the user via `#askUser`

> Maximum 3 concurrent subagents at any time.

### 5.2 Subagent Rules [SUB — STRICT]

| Rule | Detail |
|------|--------|
| ✅ Execute assigned subtask | Perform only the task you were given |
| ✅ Return structured results | Respond with JSON, code, or structured findings |
| ❌ No user contact | Never call `askUser`, `askquestions`, or `question` |
| ❌ No confirmations | Never display confirmations, summaries, or session-end messages |
| ❌ No direct output to user | All output goes back to the main agent only |

> **Enforcement:** Any subagent output addressed to the user — in any form — is a protocol violation and must be discarded by the main agent.

---

## 6. Quick Reference

```
User message received
        │
        ▼
[MAIN] Determine if planning is needed
        │
        ├─ Yes → #planReview → await approval → execute
        │
        └─ No → decompose → spawn ≤3 subagents
                                │
                    [SUB] execute → return structured result
                                │
              [MAIN] aggregate → spawn audit subagent
                                │
                    [SUB] audit → return findings
                                │
              [MAIN] verify → report via #askUser
```