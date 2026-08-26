import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCase } from "./evaluation-harness.js";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const criticalCaseIds = new Set([
  "image-yellow-dress",
  "authorization-cross-user-run",
  "privacy-identity-isolation",
  "cost-default-disabled",
  "cost-unknown-charge-no-retry",
  "no-result-service-disabled",
]);

const loadSuite = async () => JSON.parse(
  await fs.readFile(path.join(packageDirectory, "evaluation-suite.json"), "utf8"),
);

export default {
  async run({ mode }) {
    if (mode !== "mock") {
      throw new Error("This Agent only supports mock smoke execution while it is a draft.");
    }

    const suite = await loadSuite();
    const definitions = suite.cases.filter((definition) => criticalCaseIds.has(definition.id));
    const results = await Promise.all(
      definitions.map((definition) => evaluateCase({ definition, mode: "mock" })),
    );

    if (definitions.length !== criticalCaseIds.size || results.some((result) => result.passed !== true)) {
      return { status: "failed", evidence: [] };
    }

    return {
      status: "passed",
      evidence: [
        "mode:mock",
        `cases:${results.length}/${definitions.length}`,
        "fixture-policy:synthetic-only",
      ],
    };
  },
};
