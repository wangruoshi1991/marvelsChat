---
name: Agent submission
about: Submit a sealed public Agent creator package for review
---

## Creator

- Display name:
- Team, if any:
- Agent key:
- Agent version:
- Package digest:

## Goal And Scope

- User and task:
- Explicit non-goals:
- Declared profiles:
- Requested capabilities and artifacts:

## Evidence

- Creator-kit version: `0.1.0`
- Local check result:
- Creator-owned test command and result, if applicable:
- Failed or not-run cases:
- Real provider calls performed: `0` unless separately approved and evidenced

## Data, Cost And Actions

- Input data classes:
- External recipients:
- Retention and deletion:
- Payer, confirmation and budget:
- High-impact actions and confirmation point:

## Limitations And Platform Work

- Known limitations:
- Requested result presentation:
- Required platform adapter or provider:
- Required client behavior:

## Creator Checklist

- [ ] The sealed package is under `agent-submissions/<agent-key>/` and the directory matches its key.
- [ ] `check`, `seal --attest-owner`, and `verify` completed after the last package change.
- [ ] The Pull Request contains no credential, private fixture, signed URL, or raw user content.
- [ ] Expected, mock, local-real, and platform evidence are labeled separately.
- [ ] I own or am authorized to submit the included work.
- [ ] I understand that intake and merge are not runtime or publication approval.

Platform reviewers complete review, integration, sandbox, client, and release records separately. Do not mark
platform-controlled states as complete in this template.
