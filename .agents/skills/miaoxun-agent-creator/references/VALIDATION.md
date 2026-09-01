# Creator Bundle Validation

Version: `0.1.0`

Evidence date: `2026-09-01`

This record states what was actually checked before the public trial. It is not platform approval and
does not make a submitted Agent callable.

## Verified Locally

- The bundle passes its zero-dependency Node.js syntax and unit tests.
- A copied bundle outside a Git repository completes `init`, `check`, `seal --attest-owner`, `verify`,
  and local `intake` with no provider call.
- A packaged `.skill` archive can be extracted into a clean temporary directory and passes the same
  bundled tests.
- Drafts for every declared Agent profile, including an additive multi-profile draft, pass the public
  validator when the required controls are present.
- The JSON Schema and CLI validator both reject missing paid controls, missing sensitive-data consent
  or deletion support, missing high-impact confirmation, incompatible run modes, unsupported
  implementation entries, and unsupported verification claims.
- Seals are deterministic for unchanged text, and verification detects later changes.
- Intake rejects unsupported paths, symlinks, binary input, malformed contracts, unsafe states,
  secret-like material, unsealed packages, and directory/key mismatches.
- Submitted source is read and hashed as untrusted text; intake does not import or execute it.

The repository-side intake tests use temporary synthetic packages only. All observed creator-kit and
intake results report `providerCalls: 0`.

## Not Yet Verified

- The repository-only conversational evaluation scenarios, which are excluded from the distributable
  `.skill` archive, have not been run by an independent AI assistant. They are review scenarios, not
  passing evidence.
- No submitted Agent has completed the platform review, capability integration, authenticated sandbox,
  client integration, release approval, or publication stages through this public path.
- No real or paid provider, private user media, production database, server, or App build was used.
- Synthetic checks do not establish business quality, model quality, privacy, latency, cost, or
  production reliability.

## Reproduce

From the bundle directory with Node.js 20 or newer:

```bash
npm run check
npm test
```

Then follow `INTEGRATION.md` to create a temporary package and run the full local command sequence.
Platform reviewers separately run the trusted repository intake command after a submission is placed at
`agent-submissions/<agent-key>/`.

Any change to the bundle invalidates this record until the checks are rerun and the results are updated.
