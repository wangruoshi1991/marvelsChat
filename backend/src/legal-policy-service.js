import { config } from "./config.js";
import { HttpError } from "./http-error.js";

export function assertCurrentPolicyConsent(consent, legal = config.legal) {
  if (
    consent?.privacyPolicyVersion !== legal.privacyPolicyVersion
    || consent?.termsVersion !== legal.termsVersion
  ) {
    throw new HttpError(409, "Policy versions changed. Review and accept the current policies.", {
      code: "policy_version_changed",
      privacyPolicyVersion: legal.privacyPolicyVersion,
      termsVersion: legal.termsVersion,
    });
  }
  return consent;
}
