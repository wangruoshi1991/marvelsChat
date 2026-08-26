import { pathToFileURL } from "node:url";

export function assertSafeSmokeEnvironment(environment = process.env.NODE_ENV || "development") {
  if (environment === "production") {
    throw new Error("Media retrieval smoke cannot run in production.");
  }
}

export async function runMediaRetrievalMockSmoke() {
  assertSafeSmokeEnvironment();
  const { processMediaRetrievalJob } = await import("../src/media-retrieval-service.js");
  let privateMediaReads = 0;
  let temporaryArtifacts = 0;
  let providerCalls = 0;
  const failures = [];
  const result = await processMediaRetrievalJob({
    job: {
      id: "mock-smoke-job",
      userId: "mock-user",
      agentRunId: "mock-run",
      mediaAssetId: "mock-asset",
      jobType: "index",
    },
    workerId: "mock-smoke-worker",
    repository: {
      getMediaRetrievalProfile: async () => ({ indexState: "enabled" }),
      getMediaRetrievalDispatchState: async () => ({
        canDispatch: false,
        reasonCode: "retrieval_not_enabled",
      }),
      failMediaRetrievalJob: async (input) => failures.push(input),
      appendAgentRunEvent: async () => null,
    },
    provider: {
      getRuntimeStatus: () => ({
        configured: true,
        enabled: true,
        providerCallsEnabled: true,
        userDailyRequestLimit: 1,
        globalDailyBudgetFen: 1,
      }),
      describeImage: async () => { providerCalls += 1; },
      embedImage: async () => { providerCalls += 1; },
    },
    media: {
      loadOwnedMediaBytes: async () => { privateMediaReads += 1; },
      createEphemeralProviderUrl: async () => { temporaryArtifacts += 1; },
    },
  });

  const blockedBeforeRead = result.status === "blocked" &&
    result.failureCode === "retrieval_not_enabled" &&
    failures.length === 1 &&
    privateMediaReads === 0 &&
    temporaryArtifacts === 0 &&
    providerCalls === 0;
  if (!blockedBeforeRead) {
    throw new Error("Mock dispatch guard did not block before private media access.");
  }

  return {
    status: "passed",
    evidence: [
      "mode:mock",
      "dispatch:blocked-before-read",
      "provider-calls:0",
      "temporary-artifacts:0",
    ],
  };
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runMediaRetrievalMockSmoke()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Media retrieval smoke failed."}\n`);
      process.exitCode = 1;
    });
}
