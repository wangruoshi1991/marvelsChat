import { registerStationAlbumRoutes } from "./station-album-routes.js";
import { registerStationComicRoutes } from "./station-comic-routes.js";
import { registerStationContentRoutes } from "./station-content-routes.js";
import { registerStationDiaryRoutes } from "./station-diary-routes.js";
import { registerStationFileRoutes } from "./station-file-routes.js";
import { registerStationMediaRoutes } from "./station-media-routes.js";
import { registerStationOutfitRoutes } from "./station-outfit-routes.js";
import { registerStationPostRoutes } from "./station-post-routes.js";
import { registerStationProfileRoutes } from "./station-profile-routes.js";
import { registerStationSiteRoutes } from "./station-site-routes.js";
import { registerStationVideoRoutes } from "./station-video-routes.js";

export function registerStationRoutes(app, { authenticate, asyncHandler }) {
  registerStationContentRoutes(app, { authenticate, asyncHandler });
  registerStationProfileRoutes(app, { authenticate, asyncHandler });
  registerStationPostRoutes(app, { authenticate, asyncHandler });
  registerStationSiteRoutes(app, { authenticate, asyncHandler });
  registerStationFileRoutes(app, { authenticate, asyncHandler });
  registerStationComicRoutes(app, { authenticate, asyncHandler });
  registerStationVideoRoutes(app, { authenticate, asyncHandler });
  registerStationDiaryRoutes(app, { authenticate, asyncHandler });
  registerStationAlbumRoutes(app, { authenticate, asyncHandler });
  registerStationMediaRoutes(app, { authenticate, asyncHandler });
  registerStationOutfitRoutes(app, { authenticate, asyncHandler });
}
