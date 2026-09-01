# Miaoxun Agent Submission And Integration

Version: `0.1.0`

Submission model: controlled source contribution with platform review

This document makes the initial public integration path executable without pretending a self-service
runtime exists. It separates what a creator can complete from what the platform must implement.

## 1. Obtain The Creator Bundle

The public bundle is the directory `.agents/skills/miaoxun-agent-creator` in the Miaoxun repository:

<https://github.com/wangruoshi1991/marvelsChat>

Copy or download that entire directory. Do not copy only `SKILL.md`; the references, schemas, scripts,
and tests are part of the same version. Node.js 20 or newer is needed for deterministic local checks.
No package installation and no provider credential are required.

Verify the bundle itself:

```bash
cd /path/to/miaoxun-agent-creator
npm test
```

## 2. Create A Submission

Run from the copied bundle directory:

```bash
node scripts/creator-kit.mjs init \
  --output /path/to/work/my-agent \
  --key my-agent \
  --name "My Agent" \
  --creator "Creator Name" \
  --goal "The confirmed task for its users" \
  --profiles conversational \
  --format json
```

Valid profiles are listed in `SOP.md`. Use comma-separated values when several apply. The command
creates a conservative draft with real provider calls disabled and all test cases marked `not-run`.

Complete the package in its own directory. Source-based submissions may add text files under `src/`
and update `implementation.kind`, `entry`, and `testCommand`. Intake will inspect but never execute that
source. Run creator-owned tests only in an environment the creator controls after reviewing the code.

## 3. Validate And Seal

```bash
node scripts/creator-kit.mjs check /path/to/work/my-agent --format json
node scripts/creator-kit.mjs seal /path/to/work/my-agent --attest-owner --format json
node scripts/creator-kit.mjs verify /path/to/work/my-agent --format json
node scripts/creator-kit.mjs intake /path/to/work/my-agent --format json
```

Expected meanings:

| Command | Successful status | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `check` | `valid-local-draft` | public structure and deterministic safety checks passed | business quality or platform compatibility |
| `seal --attest-owner` | `sealed-for-submission` | creator explicitly attested submission rights and text files have a recorded digest | source safety or approval |
| `verify` | `verified-creator-seal` | files still match the creator seal | creator identity or runtime availability |
| `intake` | `accepted-for-review` | package can enter human review | integration, sandbox readiness, or publication |

All commands report `providerCalls: 0`. `intake` is deliberately local and unsigned. A platform Pull
Request and platform-side evidence, not this output alone, establish that the platform received it.

## 4. Submit Through GitHub

1. Fork or otherwise obtain an authorized working copy of the Miaoxun repository.
2. Create a branch containing only the new submission and any explicitly requested corrections.
3. Copy the sealed directory to `agent-submissions/<agent-key>/` without changing it.
4. Open a Pull Request against the repository's current default branch using the Agent submission
   template. Include the creator identity, package digest, profiles, test summary, limitations, and requested
   result presentation. Never paste credentials or private fixtures into the Pull Request.
5. Keep later fixes in the same Pull Request. Change the package, rerun checks, reseal it, and explain why
   the digest changed.

A creator without Git access sends the sealed directory and digest to the platform contact through the
contact method that invited the submission. The contact creates the Pull Request without altering evidence
or claiming authorship. This fallback does not grant the contact permission to change the Agent's scope.

## 5. Platform Intake

The reviewer checks out the Pull Request in an isolated worktree and uses the validator from the trusted
base branch, not a modified copy supplied by the same Pull Request:

```bash
node .agents/skills/miaoxun-agent-creator/scripts/creator-kit.mjs \
  intake agent-submissions/<agent-key> --format json
```

The reviewer then records one outcome in the Pull Request:

- `changes-requested`: the package remains unintegrated and lists concrete corrections.
- `accepted-for-review`: deterministic intake passed and specialist review continues.
- `rejected`: a stated policy, ownership, safety, feasibility, or maintenance issue prevents continuation.

No intake command executes `src/`, installs dependencies, starts services, calls providers, reads user data,
or writes platform registry/runtime state.

## 6. Review Checklist

Platform reviewers verify, as applicable:

- creator identity, right to submit, maintenance contact, and license obligations;
- goal, non-goals, misleading claims, and user-facing limitations;
- input, output, public error, task lifecycle, events, artifacts, and deletion contracts;
- authentication, per-user authorization, consent, retention, purge, and cross-user isolation;
- provider recipients, data minimization, secret handling, timeouts, and safe error mapping;
- payer, confirmation, quotas, budget, retry safety, unknown-billing handling, and kill switches;
- source dependencies, network and filesystem access, subprocesses, parsing, injection, and supply chain;
- test provenance, missing cases, mock boundaries, failed cases, and required real calibration;
- App entry, progress, cancellation, result viewer, unavailable states, and minimum client build;
- ownership of support, monitoring, pause, rollback, retirement, and data cleanup.

The reviewer does not turn a missing decision into an assumption. A correction is added to the package and
resealed, or a platform-owned decision is recorded in integration evidence outside the creator seal.

## 7. Approved Integration Forms

After review, the platform chooses one form. Creators may request a form but cannot select it unilaterally.

### Platform-managed instructions

The platform stores reviewed instructions and invokes an approved model through its own provider boundary.
The platform owns authentication, tool permissions, model configuration, redaction, budget, and audit.

### Reviewed source capability

The capability integrator ports or binds reviewed source into a platform-owned package. External code is not
loaded into the primary server merely because it was submitted. Tests run in an isolated approved environment
before the capability is connected to user routes.

### Controlled external-service adapter

The platform implements a provider adapter for an approved service contract. The App never calls the service
directly. Endpoint allowlists, authentication, timeouts, data transfer, errors, rate limits, costs, and service
shutdown behavior are platform-controlled. Secrets are configured outside source and submission files.

## 8. Sandbox Requirements

Platform evidence must identify the exact repository revision, Agent version, backend build, client build,
fixture class, commands, and results. At minimum, test:

1. authenticated creation or invocation through the actual platform-owned route;
2. ownership and two-user isolation;
3. invalid input, safe public errors, unavailable runtime, and timeout;
4. duplicate request and idempotency behavior;
5. progress, cancel, resume, and recovery when applicable;
6. provider-disabled behavior and zero-call mock mode;
7. consent withdrawal, deletion, and no resurrection when applicable;
8. quotas, budget, cost confirmation, unknown billing, and kill switch when applicable;
9. artifact ownership, viewer, download, retention, and deletion when applicable;
10. App entry, state text, result presentation, and incompatible-build behavior.

The platform records `sandbox-ready` only after applicable cases pass in the actual test environment. Creator
tests and local intake remain visible as separate evidence.

## 9. Release And Publication

Publication requires a versioned Agent record, enabled and ready runtime, approved client behavior, monitoring,
budget controls, rollback, support owner, and release-owner approval. Only then may the platform record
`release-approved` and subsequently `published`.

Registration, merging a submission, merging capability source, a successful build, or an HTTP 200 is not enough.
Pause new runs on safety, privacy, billing, or provider uncertainty and follow the approved cleanup plan.

## 10. Current Limitations

- There is no self-service marketplace or generic external Agent runtime promised by this bundle.
- The source-contribution route requires platform review and platform implementation after creator submission.
- The local intake receipt is intentionally not cryptographic platform approval.
- Business quality and paid-provider calibration cannot be inferred from synthetic examples.
- Client integration remains platform work and is not generated by the public creator CLI.

These limitations are explicit so a creator can complete useful work without being misled about publication.
