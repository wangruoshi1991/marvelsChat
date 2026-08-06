const localViewerOrigin = "null";
const avatarModelFilePath = /^\/api\/avatar-3d\/app\/models\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/file\/?$/i;
const localViewerMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const isLocalAvatarViewerRequest = (req) =>
  req.get("origin") === localViewerOrigin
  && localViewerMethods.has(String(req.method || "").toUpperCase())
  && avatarModelFilePath.test(req.path);

export function createCorsOptionsDelegate({ origin }) {
  return (req, callback) => {
    if (isLocalAvatarViewerRequest(req)) {
      callback(null, {
        allowedHeaders: ["Authorization", "Range"],
        credentials: false,
        exposedHeaders: [
          "Accept-Ranges",
          "Content-Length",
          "Content-Range",
          "X-Request-ID",
        ],
        maxAge: 600,
        methods: ["GET", "HEAD", "OPTIONS"],
        origin: localViewerOrigin,
      });
      return;
    }

    callback(null, {
      exposedHeaders: ["X-Request-ID"],
      origin,
    });
  };
}
