import { createMediaRetrievalBudgetAdminRepository } from "./media-retrieval-budget-admin-repository.js";
import { createMediaRetrievalIndexLifecycleRepository } from "./media-retrieval-index-lifecycle-repository.js";
import {
  defaultIdFactory,
  defaultTraceIdFactory,
} from "./media-retrieval-repository-shared.js";
import { createMediaRetrievalRetrievalRepository } from "./media-retrieval-retrieval-repository.js";
import { createMediaRetrievalRunEventRepository } from "./media-retrieval-run-event-repository.js";

// Compose independently testable persistence concerns behind one repository.
export function createMediaRetrievalRepository({
  query,
  withTransaction,
  now = () => new Date(),
  idFactory = defaultIdFactory,
  traceIdFactory = defaultTraceIdFactory,
} = {}) {
  if (typeof query !== "function" || typeof withTransaction !== "function") {
    throw new TypeError("createMediaRetrievalRepository requires query and withTransaction functions.");
  }

  const runEvents = createMediaRetrievalRunEventRepository({
    query,
    withTransaction,
    idFactory,
    traceIdFactory,
  });
  const {
    appendEventWithConnection,
    insertMediaRetrievalRun,
    updateRunLifecycle,
    ...publicRunEvents
  } = runEvents;
  const indexLifecycle = createMediaRetrievalIndexLifecycleRepository({
    query,
    withTransaction,
    idFactory,
    appendAgentRunEvent: runEvents.appendAgentRunEvent,
    appendEventWithConnection,
    insertMediaRetrievalRun,
    updateRunLifecycle,
  });
  const retrieval = createMediaRetrievalRetrievalRepository({ query });
  const budgetAdmin = createMediaRetrievalBudgetAdminRepository({
    query,
    withTransaction,
    now,
    idFactory,
    getMediaRetrievalProfile: indexLifecycle.getMediaRetrievalProfile,
  });
  return {
    ...publicRunEvents,
    ...indexLifecycle,
    ...retrieval,
    ...budgetAdmin,
  };
}
