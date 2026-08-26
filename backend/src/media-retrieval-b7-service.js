import { retrieveB7ProductBaselineCore } from "./media-retrieval-b7-core.js";

const FORBIDDEN_PRODUCT_INPUTS = Object.freeze([
  "snapshotId",
  "stageReceiptContext",
  "stageReceiptRecorder",
  "formalReceipt",
  "experimentManifest",
  "evaluator",
]);

// Public product composition. Deliberately accepts no research receipt,
// snapshot, evaluator, manifest, or caller-supplied execution facts.
export const retrieveB7ProductBaseline = (input = {}) => {
  for (const key of FORBIDDEN_PRODUCT_INPUTS) {
    if (Object.hasOwn(input, key)) {
      throw new TypeError("B7 product retrieval does not accept research runtime inputs.");
    }
  }
  return retrieveB7ProductBaselineCore(input);
};
