import { HttpError } from "./http-error.js";
import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";
import { createMediaRetrievalUserService } from "./media-retrieval-user-service.js";
import { mediaRetrievalIdempotencyKeySchema } from "./schemas.js";
import {
  resolveAgentGrantedScopes,
  setUserAgentAccess,
} from "./repositories.js";

export function createAlbumProductLifecycleHook({ getRuntimeStatus }) {
  return async ({ userId, enabled, consentVersion, idempotencyKey, connection }) => {
    const repository = createMediaRetrievalRepository({
      query: connection.query.bind(connection),
      withTransaction: (work) => work(connection),
    });
    const service = createMediaRetrievalUserService({
      repository,
      getRuntimeStatus,
    });
    const profile = await repository.getMediaRetrievalProfile({ userId });
    if (enabled) {
      if (!(profile?.indexState === "enabled" && profile.consentVersion === MEDIA_RETRIEVAL_CONSENT_VERSION)) {
        if (consentVersion !== MEDIA_RETRIEVAL_CONSENT_VERSION) {
          throw new HttpError(409, "请先同意相册 AI 使用已上传素材建立云端检索索引。", { code: "ALBUM_CONSENT_REQUIRED" });
        }
        return service.enableMediaRetrieval({ userId, consentVersion, idempotencyKey });
      }
      return null;
    }
    const access = await connection.query("SELECT enabled FROM user_agents WHERE user_id = ? AND agent_id = ?", [userId, "album-manager"]);
    if (!access[0]?.enabled && profile?.indexState === "enabled") {
      return service.deleteMediaRetrievalIndex({ userId, idempotencyKey });
    }
    return null;
  };
}

export function createAlbumAssistantAccessService({
  withTransaction,
  getRuntimeStatus,
  setAccess = setUserAgentAccess,
}) {
  return async ({ userId, agent, body, idempotencyKey }) => {
    if (body.enabled) resolveAgentGrantedScopes(agent, body.grantedScopes);
    const operationKey = mediaRetrievalIdempotencyKeySchema.parse(
      idempotencyKey || ""
    );
    return withTransaction(async (connection) => {
      // User-row locking also serializes access changes with account deletion.
      const users = await connection.query(
        "SELECT id FROM users WHERE id = ? FOR UPDATE",
        [userId]
      );
      if (!users[0]) throw new HttpError(404, "User not found");
      const hook = createAlbumProductLifecycleHook({ getRuntimeStatus });
      await hook({
        userId,
        enabled: body.enabled,
        consentVersion: body.albumAIConsentVersion,
        idempotencyKey: operationKey,
        connection,
      });
      return setAccess({
        userId,
        agent,
        enabled: body.enabled,
        alias: body.alias,
        grantedScopes: body.grantedScopes,
        connection,
      });
    });
  };
}
