# Agent Submissions

This directory is the controlled intake location for public Agent creator packages.

Creators start with the self-contained bundle at
[`../.agents/skills/miaoxun-agent-creator`](../.agents/skills/miaoxun-agent-creator/), then place one
sealed package at:

```text
agent-submissions/<agent-key>/
```

Before opening a Pull Request, run the public `check`, `seal --attest-owner`, and `verify` commands documented in
[`INTEGRATION.md`](../.agents/skills/miaoxun-agent-creator/references/INTEGRATION.md).

Platform reviewers use the creator-kit implementation from the trusted base branch, not a validator
modified by the submission, and run:

```bash
node .agents/skills/miaoxun-agent-creator/scripts/creator-kit.mjs \
  intake agent-submissions/<agent-key> --format json
```

The reviewer also confirms that the directory name matches the returned sealed Agent key.

An intake result of `accepted-for-review` is not approval and does not make an Agent callable. Submitted
source is treated as untrusted text and is not executed by intake. Backend, provider, database, App, Admin,
artifact, budget, and runtime integration happen only after separate platform review.

Do not add credentials, private media, signed URLs, compiled binaries, dependencies, or fabricated evidence.
