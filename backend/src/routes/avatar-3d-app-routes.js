import { avatar3dLifecycleService } from "../avatar-3d-lifecycle-service.js";
import {
  avatar3dJobCreateLimit,
  avatar3dPhotoMutationLimit,
  privateImmutableCacheControl,
  streamAvatar3dPrivateObject,
} from "../avatar-3d-route-support.js";
import { createUsageEvent } from "../repositories.js";
import { registerAvatar3dLifecycleRoutes } from "./avatar-3d-lifecycle-routes.js";

export function registerAvatar3dAppRoutes(app, {
  authenticate,
  asyncHandler,
  service = avatar3dLifecycleService,
  recordUsageEvent = createUsageEvent,
  streamPrivateObject = streamAvatar3dPrivateObject,
} = {}) {
  registerAvatar3dLifecycleRoutes(app, {
    basePath: "/api/avatar-3d/app",
    authenticate,
    asyncHandler,
    service,
    recordUsageEvent,
    streamPrivateObject,
    modelFileMethod: "getAppModelFile",
    modelAssetCacheControl: privateImmutableCacheControl,
    guards: {
      preparePhoto: [avatar3dPhotoMutationLimit],
      completePhoto: [avatar3dPhotoMutationLimit],
      deletePhoto: [avatar3dPhotoMutationLimit],
      createJob: [avatar3dJobCreateLimit],
      confirmReferences: [avatar3dJobCreateLimit],
    },
  });
}
