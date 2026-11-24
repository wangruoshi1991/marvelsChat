# Miaoxun A01-A23 Local Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Repair and locally verify all 23 dispatched Miaoxun work orders in the designated worktree while preserving collaborator changes.

**Architecture:** Independent backend lifecycle, backend business, and client/Web groups run in parallel. Shared migrations and cross-layer contracts are integrated only after the owning groups report. A14 and A15 run after business changes, then one whole-repository verification pass updates the handoff.

**Tech Stack:** Node.js, Express, PostgreSQL/pgvector, React Native TypeScript, Vite React, Docker Compose, GitHub Actions, Jest/Vitest/Playwright.

**Spec:** `docs/reviews/2026-11-18-implementation-prompts.md` and `docs/reviews/2026-11-18-project-audit-dispatch.md`

## Global Constraints

- Work only in `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat` on `codex/ui-agent-candidate-20261105`.
- Preserve all existing tracked and untracked collaborator changes.
- Use local substitutes and synthetic databases only. No push, deploy, production mutation, paid provider, or TestFlight upload.
- Keep real data and explicit failure states. Add migrations in current ledger order and synchronize API, tests, configuration examples, and docs.
- Record every work order's pass, fail, or skip evidence and remaining device/external verification in `docs/handoffs/CURRENT.md`.

## Execution Tasks

1. Parallel backend lifecycle group: A21, A16, A13.
2. Parallel backend business group: A01, A03, A04, A05, A06, A18, A22, A23.
3. Parallel client/Web group: A02, A07, A08, A09, A10, A11, A12, A17, A19, A20.
4. Integrate A14 CI, worker health probes, isolated startup documentation after A06.
5. Review all static references and perform A15 cleanup only after the preceding groups are verified.
6. Run targeted PostgreSQL, browser, native, build, lint, type, test, `./scripts/check-repository.sh`, and `git diff --check` gates. Fix confirmed integration defects, then update the handoff and produce the A01-A23 ledger.
