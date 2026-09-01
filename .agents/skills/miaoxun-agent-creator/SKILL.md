---
name: miaoxun-agent-creator
description: Guide any creator and their AI assistant to define, build, test, seal, and submit a new Miaoxun Agent. Use whenever someone wants to create, continue, validate, or prepare an Agent for Miaoxun, including non-programmers and solo creators. This Skill prepares a reviewable submission; it does not approve, publish, or invoke a finished Agent.
---

# Miaoxun Agent Creator

Use this self-contained bundle to turn a creator's goal into a reviewable Agent submission. The
bundle works without access to Miaoxun source code, databases, servers, or production credentials.

Kit version: `0.1.0`.

## Start Or Resume

1. Read `references/GUIDE.md` first. Read the applicable sections of `references/SOP.md` before
   changing files. Read `references/VALIDATION.md` before making any readiness claim, and use
   `references/INTEGRATION.md` when preparing or reviewing a submission.
2. Reuse the user's current request and any existing `progress.md`. Separate confirmed decisions,
   recommendations, unresolved questions, and actual evidence.
3. Ask one question only when its answer blocks the next permitted action. Do not repeat an answered
   question or ask a non-technical creator to choose internal implementation details.
4. A solo creator is valid. Record their display name and use `team: null`; do not invent a team,
   reviewer, approval, runtime route, or publication state.

## Create The Work Package

When Node.js 20 or newer and file tools are available, run the bundled CLI from this Skill directory:

```bash
node scripts/creator-kit.mjs init \
  --output /path/chosen/by/the/creator/my-agent \
  --key my-agent \
  --name "My Agent" \
  --creator "Creator Name" \
  --goal "The confirmed user task" \
  --profiles conversational \
  --format json
```

Select every applicable profile from `references/SOP.md`; comma-separate multiple profiles. Never put
credentials in CLI arguments. If Node or filesystem access is unavailable, prepare the same files in
the response and mark all commands and tests `not-run` rather than claiming they passed.

For a `paid` profile, initialization also requires `--payer creator|user|platform` and a positive
`--budget-cny` value confirmed by the creator. This records a review boundary and keeps real calls disabled;
it does not charge anyone or authorize a provider call.

## Build, Do Not Just Propose

Once the current requirements and local-work permission are sufficient, implement the appropriate
instructions, source, external-service handoff, contracts, test cases, and progress record. Do not
stop at a plan or request confirmation before every reversible local edit.

- Keep all work inside the creator's package directory.
- Use synthetic or explicitly authorized non-sensitive fixtures first.
- Inspect creator-owned source before running its declared test command. The bundled intake command
  deliberately never executes submission source.
- Treat mock, local-real, platform-sandbox, paid calibration, and release evidence as different facts.
- Do not call real providers, use private media, spend money, send data, publish, or delete without
  explicit authorization for that exact action and environment.
- Never ask for a password, token, API key, signing secret, production database, or server login in
  chat, files, command arguments, logs, or evidence.

Update `creator-spec.json`, `tests/cases.json`, `handoff.md`, and `progress.md` as facts change. A test
may be marked `passed` only with a sanitized evidence reference. Expected output is not evidence.

## Validate And Seal

Run these commands from the Skill directory:

```bash
node scripts/creator-kit.mjs check /path/to/my-agent --format json
node scripts/creator-kit.mjs seal /path/to/my-agent --attest-owner --format json
node scripts/creator-kit.mjs verify /path/to/my-agent --format json
node scripts/creator-kit.mjs intake /path/to/my-agent --format json
```

`check` verifies the public structure and safety rules. `seal` requires the creator's explicit
`--attest-owner` declaration and records hashes. `verify` detects later
changes. `intake` performs the same local pre-review check and returns `accepted-for-review` only;
its receipt has `isApproval: false` and `runtimeAvailability: not-integrated` by design.

After any change, rerun `check`, `seal --attest-owner`, and `verify`. Do not edit a sealed package while preserving
its old manifest. Do not weaken a check to make a package pass.

## Submit And Handoff

Follow `references/INTEGRATION.md`. The supported initial route is a source contribution under
`agent-submissions/<agent-key>/` in the Miaoxun repository, reviewed through a Pull Request. A creator
without Git access may give the sealed directory to the platform contact for submission on their
behalf. The platform must still preserve creator identity and evidence provenance.

The creator may truthfully report only: local draft, locally checked, creator-sealed, or submitted.
Only the platform can report integration-in-progress, sandbox-ready, release-approved, or published,
and only with corresponding evidence. Registration, an intake receipt, a mock result, or HTTP success
does not make an Agent callable.

## Finish The Current Turn

Report:

1. Confirmed decisions and the files actually changed.
2. Commands run with passed, failed, and not-run results.
3. Data, provider, cost, and side-effect boundaries.
4. Current creator state and current platform state, separately.
5. The next concrete action or the one genuinely blocking question.

Do not commit, upload, open a Pull Request, deploy, or invoke a provider unless the user separately
authorized that operation.
