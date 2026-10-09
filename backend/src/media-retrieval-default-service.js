import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { createMediaRetrievalProvider } from "./media-retrieval-provider.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";
import { createMediaRetrievalUserService } from "./media-retrieval-user-service.js";

export const mediaRetrievalRepository = createMediaRetrievalRepository({ query, withTransaction });
export const mediaRetrievalUserService = createMediaRetrievalUserService({
  repository: mediaRetrievalRepository,
  provider: createMediaRetrievalProvider({ config }),
  getRuntimeStatus: buildMediaRetrievalRuntimeStatus,
});
