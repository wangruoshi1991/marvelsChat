import { config } from "../config.js";
import { ZodError } from "zod";
import { query, withTransaction } from "../db.js";
import { createMediaRetrievalProvider } from "../media-retrieval-provider.js";
import { createMediaRetrievalRepository } from "../media-retrieval-repository.js";
import {
  createMediaRetrievalUserService,
  MediaRetrievalServiceError,
} from "../media-retrieval-user-service.js";
import {
  mediaRetrievalEventsQuerySchema,
  mediaRetrievalRunParamsSchema,
} from "../schemas.js";

const createDefaultService = () =>
  createMediaRetrievalUserService({
    repository: createMediaRetrievalRepository({ query, withTransaction }),
    provider: createMediaRetrievalProvider({ config }),
  });

const safeMediaRetrievalHandler = (asyncHandler, handler) =>
  asyncHandler(async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof MediaRetrievalServiceError) throw error;
      if (error instanceof ZodError) {
        throw new MediaRetrievalServiceError("retrieval_request_invalid");
      }
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
  });

export function registerAgentRunRoutes(app, { authenticate, asyncHandler, service = createDefaultService() }) {
  app.get(
    "/api/agent-runs/:runId/events",
    authenticate,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      const { runId } = mediaRetrievalRunParamsSchema.parse(req.params);
      const { afterSequence } = mediaRetrievalEventsQuerySchema.parse(req.query);
      const data = await service.getAgentRunEvents({
        userId: req.user.id,
        agentRunId: runId,
        afterSequence,
      });
      res.json({ data });
    }),
  );
}
