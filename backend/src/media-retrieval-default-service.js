import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { createMediaRetrievalProvider } from "./media-retrieval-provider.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";
import { createMediaRetrievalUserService } from "./media-retrieval-user-service.js";
import { createMediaRetrievalVisualResolver } from "./media-retrieval-visual-resolver.js";
import { loadOwnedMediaBytes, normalizeImageForReranking, extractVideoFramesAtTimestamps } from "./media-retrieval-media.js";
import { fetchOssObject } from "./oss-service.js";

export const mediaRetrievalRepository = createMediaRetrievalRepository({ query, withTransaction });
export const mediaRetrievalUserService = createMediaRetrievalUserService({
  repository: mediaRetrievalRepository,
  provider: createMediaRetrievalProvider({ config }),
  resolveCandidateVisuals: createMediaRetrievalVisualResolver({
    repository: mediaRetrievalRepository,
    media: {
      loadOwnedMediaBytes: input => loadOwnedMediaBytes({ ...input, fetchOssObject }),
      normalizeImageForReranking,
      extractVideoFramesAtTimestamps,
    },
  }),
  getRuntimeStatus: buildMediaRetrievalRuntimeStatus,
});
