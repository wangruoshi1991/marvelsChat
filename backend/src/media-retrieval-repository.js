import { createMediaRetrievalBudgetAdminRepository } from "./media-retrieval-budget-admin-repository.js";
import { createMediaRetrievalIndexLifecycleRepository } from "./media-retrieval-index-lifecycle-repository.js";
import {
  defaultIdFactory,
  defaultTraceIdFactory,
} from "./media-retrieval-repository-shared.js";
import { createMediaRetrievalRetrievalRepository } from "./media-retrieval-retrieval-repository.js";
import { createMediaRetrievalRunEventRepository } from "./media-retrieval-run-event-repository.js";

// Compatibility facade: callers retain one repository while each persistence
// concern has an independently testable implementation module.
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
    now,
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
    now,
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
