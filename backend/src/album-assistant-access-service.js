import { HttpError } from "./http-error.js";
import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";
import { createMediaRetrievalUserService } from "./media-retrieval-user-service.js";
import { mediaRetrievalIdempotencyKeySchema } from "./schemas.js";
import { resolveAgentGrantedScopes, setUserAgentAccess } from "./repositories.js";

export function createAlbumAssistantAccessService({
  withTransaction,
  getRuntimeStatus,
  setAccess = setUserAgentAccess,
}) {
  return async ({ userId, agent, body, idempotencyKey }) => {
    resolveAgentGrantedScopes(agent, body.grantedScopes);
    return withTransaction(async (connection) => {
      // User-row locking also serializes access changes with account deletion.
      const users = await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!users[0]) throw new HttpError(404, "User not found");
      const repository = createMediaRetrievalRepository({
        query: connection.query,
        withTransaction: (work) => work(connection),
      });
      const service = createMediaRetrievalUserService({ repository, getRuntimeStatus });
      const profile = await repository.getMediaRetrievalProfile({ userId });
      if (body.enabled && !(profile?.indexState === "enabled" && profile.consentVersion === MEDIA_RETRIEVAL_CONSENT_VERSION)) {
        if (body.albumAIConsentVersion !== MEDIA_RETRIEVAL_CONSENT_VERSION) {
          throw new HttpError(409, "请先同意相册 AI 使用已上传素材建立云端检索索引。");
        }
        await service.enableMediaRetrieval({
          userId,
          consentVersion: body.albumAIConsentVersion,
          idempotencyKey: mediaRetrievalIdempotencyKeySchema.parse(idempotencyKey || ""),
        });
      }
      if (!body.enabled && profile?.indexState === "enabled") {
        await service.deleteMediaRetrievalIndex({
          userId,
          idempotencyKey: mediaRetrievalIdempotencyKeySchema.parse(idempotencyKey || ""),
        });
      }
      return setAccess({
        userId, agent, enabled: body.enabled, alias: body.alias,
        grantedScopes: body.grantedScopes, connection,
      });
    });
  };
}
