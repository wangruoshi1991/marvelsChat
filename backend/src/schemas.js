import { z } from "zod";

export const phoneNumberSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, "Phone number must be a valid mainland China mobile number");

export const passwordSchema = z.string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, "Password must include one uppercase letter")
  .regex(/[a-z]/, "Password must include one lowercase letter");

export const displayNameSchema = z.string().trim().min(1).max(40);

const policyVersionSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/);

export const userConsentSchema = z.object({
  privacyPolicyVersion: policyVersionSchema,
  termsVersion: policyVersionSchema,
  privacyAccepted: z.literal(true),
  termsAccepted: z.literal(true),
});

export const registerSchema = z.object({
  contactType: z.enum(["email", "phone"]),
  email: z.string().email().max(190).optional(),
  phoneNumber: phoneNumberSchema.optional(),
  password: passwordSchema,
  displayName: displayNameSchema,
  consent: userConsentSchema.optional(),
}).transform((value) => ({
  ...value,
  email: value.email ? value.email.toLowerCase().trim() : null,
  phoneNumber: value.phoneNumber ? value.phoneNumber.replace(/\D/g, "") : null,
})).refine(
  (value) =>
    (value.contactType === "email" && Boolean(value.email)) ||
    (value.contactType === "phone" && Boolean(value.phoneNumber)),
  { message: "Register contact is required", path: ["contactType"] },
);

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(190).optional(),
  email: z.string().trim().min(1).max(190).optional(),
  password: z.string().min(1).max(128),
}).transform((value) => ({
  identifier: (value.identifier || value.email || "").toLowerCase().trim(),
  password: value.password,
})).refine((value) => value.identifier.length > 0, {
  message: "Login identifier is required",
  path: ["identifier"],
});

export const messageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  replyToMessageId: z.string().uuid().optional(),
  clientContext: z.object({
    currentPage: z.string().trim().min(1).max(120).optional(),
    language: z.enum(["zh", "en"]).optional(),
    appearance: z.enum(["light", "dark"]).optional(),
    profileSnapshot: z.object({
      nickname: z.string().trim().max(80).optional(),
      followersCount: z.number().int().min(0).optional(),
      followingCount: z.number().int().min(0).optional(),
      collectionsCount: z.number().int().min(0).optional(),
      miaoPoints: z.number().int().min(0).optional(),
    }).optional(),
    enabledAgentIds: z.array(z.string().trim().min(1).max(80)).max(64).optional(),
  }).optional(),
  localActionResult: z.object({
    type: z.string().trim().min(1).max(80),
    status: z.enum(["applied", "rejected", "unsupported"]),
    message: z.string().trim().min(1).max(300),
  }).optional(),
});

export const threadPreferencesSchema = z.object({
  muted: z.boolean(),
});

export const stationConfigSchema = z.object({
  language: z.enum(["zh", "en"]).optional(),
  appearance: z.enum(["light", "dark"]).optional(),
});

export const presenceSchema = z.object({
  presenceMode: z.enum(["online", "offline", "hidden"]),
});

export const avatarConfigSchema = z.object({
  version: z.literal(2).optional().default(2),
  seed: z.string().trim().max(40).optional(),
  body: z.enum(["compact", "standard", "tall", "strong"]).optional(),
  face: z.enum(["soft", "oval", "angular", "round"]).optional(),
  skinTone: z.enum(["porcelain", "warm", "tan", "deep"]).optional(),
  hairStyle: z.enum(["short", "bob", "wave", "curly", "undercut"]).optional(),
  hairColor: z.enum(["black", "brown", "copper", "silver", "blue"]).optional(),
  outfit: z.enum(["street", "campus", "tech", "artist", "sport"]).optional(),
  accent: z.enum(["sunrise", "mint", "sky", "rose", "violet"]).optional(),
  expression: z.enum(["calm", "smile", "focus"]).optional(),
  accessory: z.enum(["none", "glasses", "cap", "headphones", "spark"]).optional(),
  pose: z.enum(["casual", "hello", "ready"]).optional(),
  eyeStyle: z.enum(["round", "bright", "calm", "sharp"]).optional(),
  browStyle: z.enum(["soft", "straight", "bold", "tilt"]).optional(),
  mouthStyle: z.enum(["smile", "calm", "confident", "cute"]).optional(),
  top: z.enum(["hoodie", "shirt", "jacket", "sweater", "uniform"]).optional(),
  bottom: z.enum(["cargo", "jeans", "shorts", "skirt", "track"]).optional(),
  shoes: z.enum(["sneaker", "boot", "canvas", "runner"]).optional(),
  action: z.enum(["stand", "cross-arms", "wave", "soccer", "question", "sit"]).optional(),
  shape: z.enum(["circle", "rounded", "squircle"]).optional(),
  palette: z.enum(["sunrise", "mint", "sky", "grape", "mono"]).optional(),
});

export const profileSelfSchema = z.object({
  nickname: z.string().trim().min(1).max(80),
  avatarText: z.string().trim().min(1).max(8).optional(),
  bio: z.string().trim().max(500).optional().default(""),
  community: z.string().trim().max(120).optional().default(""),
  activityArea: z.string().trim().max(120).optional().default(""),
  avatarConfig: avatarConfigSchema.optional().default({}),
});

export const stationVisibilitySchema = z.enum(["private", "friends", "public"]);

export const stationDiarySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(6000),
  mood: z.string().trim().max(40).optional().default(""),
  visibility: stationVisibilitySchema.optional().default("private"),
});

export const stationDiaryUpdateSchema = stationDiarySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one diary field is required.",
  });

export const stationDiaryParamsSchema = z.object({
  entryId: z.string().uuid(),
});

export const stationAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  visibility: stationVisibilitySchema.optional().default("private"),
});

export const stationAlbumUpdateSchema = stationAlbumSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one album field is required.",
  });

export const stationAlbumParamsSchema = z.object({
  albumId: z.string().uuid(),
});

export const stationMediaAssetSchema = z.object({
  albumId: z.string().uuid().optional().nullable(),
  kind: z.enum(["image", "video"]).optional().default("image"),
  originalFilename: z.string().trim().max(180).optional().default(""),
  mimeType: z.string().trim().max(120).optional().default(""),
  byteSize: z.number().int().min(0).optional().nullable(),
  width: z.number().int().min(0).optional().nullable(),
  height: z.number().int().min(0).optional().nullable(),
  caption: z.string().trim().max(1000).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  metadata: z.record(z.any()).optional().default({}),
});

export const stationMediaAssetUpdateSchema = z
  .object({
    albumId: z.string().uuid().optional().nullable(),
    caption: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one media field is required.",
  });

export const stationMediaTagsSchema = z.object({
  caption: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  metadata: z.record(z.any()).optional().default({}),
});

export const stationMediaSearchSchema = z.object({
  query: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(80).optional().default(40),
});

export const stationMediaAssetParamsSchema = z.object({
  mediaAssetId: z.string().uuid(),
});

export const stationMediaAssetRouteParamsSchema = stationMediaAssetParamsSchema;

const stationMediaMimeTypes = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

export const stationMediaUploadLimits = Object.freeze({
  image: 25 * 1024 * 1024,
  video: 250 * 1024 * 1024,
});

export const stationMediaUploadUrlSchema = z
  .object({
    mimeType: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => stationMediaMimeTypes.has(value), {
        message: "Unsupported station media type.",
      }),
    byteSize: z.number().int().min(0).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.byteSize === null || value.byteSize === undefined) return;
    const kind = value.mimeType.startsWith("video/") ? "video" : "image";
    if (value.byteSize > stationMediaUploadLimits[kind]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["byteSize"],
        message: `Station ${kind} exceeds the upload size limit.`,
      });
    }
  });

export const stationMediaUploadCompleteSchema = z.object({
  storageKey: z.string().trim().min(1).max(512),
});

export const stationAlbumSuggestionApplySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  visibility: stationVisibilitySchema.optional().default("private"),
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(80),
});

export const stationOutfitSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional().default(""),
  avatarConfig: avatarConfigSchema.optional().default({}),
  mediaAssetId: z.string().uuid().optional().nullable(),
  visibility: stationVisibilitySchema.optional().default("private"),
});

export const stationSiteDraftRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  apply: z.boolean().optional().default(false),
});

export const stationSiteDraftParamsSchema = z.object({
  draftId: z.string().uuid(),
});

const homepageMediaAssetIdsSchema = z
  .array(z.string().uuid())
  .min(3)
  .max(9)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Homepage media asset IDs must be unique.",
  });

const homepageSectionSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  type: z.enum(["hero", "about", "gallery", "diary", "contact"]),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(180).default(""),
  body: z.string().trim().max(900).default(""),
  assetIds: z.array(z.string().uuid()).max(9).default([]),
  diaryEntryIds: z.array(z.string().uuid()).max(8).default([]),
  actions: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    kind: z.enum(["message", "follow", "link"]),
    href: z.string().trim().max(240).default(""),
  })).max(3).default([]),
  hidden: z.boolean().default(false),
});

export const homepageDraftContentSchema = z.object({
  version: z.literal(2),
  language: z.enum(["zh", "en"]).default("zh"),
  title: z.string().trim().min(1).max(80),
  theme: z.enum(["clean", "gallery"]),
  summary: z.string().trim().max(240).default(""),
  sections: z.array(homepageSectionSchema).min(1).max(8),
}).superRefine((draft, context) => {
  const sectionIds = draft.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Homepage section IDs must be unique.",
      path: ["sections"],
    });
  }
});

export const homepageGenerateSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  mediaAssetIds: homepageMediaAssetIdsSchema,
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
});

export const homepageJobParamsSchema = z.object({
  jobId: z.string().uuid(),
});

export const homepageDraftUpdateSchema = z.object({
  revision: z.number().int().min(1),
  draft: homepageDraftContentSchema,
});

export const homepageRefineSchema = z.object({
  revision: z.number().int().min(1),
  sectionId: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  instruction: z.string().trim().min(1).max(600),
});

export const homepagePublishSchema = z.object({
  revision: z.number().int().min(1),
  visibility: z.enum(["private", "link"]),
});

export const homepageAccessTokenSchema = z.object({
  token: z.string().trim().min(43).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});

export const homepageReleaseParamsSchema = z.object({
  releaseId: z.string().uuid(),
});

export const accountDeletionSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal("DELETE"),
});

export const avatar3dCostVersion = "2026-07-17";
export const avatar3dPhotoUploadLimit = 10 * 1024 * 1024;

export const avatar3dSessionSchema = loginSchema;

export const avatar3dPhotoUploadSchema = z.object({
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().min(1).max(avatar3dPhotoUploadLimit),
}).strict();

export const avatar3dPhotoCompleteSchema = z.object({}).strict();

const avatar3dJobPhotoSchema = z.object({
  photoId: z.string().uuid(),
  view: z.enum(["front", "left", "back", "right"]),
}).strict();

export const avatar3dCreateJobSchema = z.object({
  style: z.enum(["realistic", "cartoon"]),
  photos: z.array(avatar3dJobPhotoSchema).min(1).max(4),
  acceptedPhotoRights: z.literal(true),
  acceptedCostVersion: z.literal(avatar3dCostVersion),
}).strict().superRefine((value, context) => {
  const views = value.photos.map((photo) => photo.view);
  const photoIds = value.photos.map((photo) => photo.photoId);
  if (!views.includes("front")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A front photo is required.",
      path: ["photos"],
    });
  }
  if (new Set(views).size !== views.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Avatar photo views must be unique.",
      path: ["photos"],
    });
  }
  if (new Set(photoIds).size !== photoIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Avatar photo IDs must be unique.",
      path: ["photos"],
    });
  }
});

export const avatar3dIdempotencySchema = z.object({
  idempotencyKey: z.string().uuid(),
}).strict();

export const avatar3dStyleConfirmSchema = z.object({
  accepted: z.literal(true),
}).strict();

export const avatar3dPhotoParamsSchema = z.object({ photoId: z.string().uuid() }).strict();
export const avatar3dJobParamsSchema = z.object({ jobId: z.string().uuid() }).strict();
export const avatar3dModelParamsSchema = z.object({ modelId: z.string().uuid() }).strict();

export const stationModelJobRequestSchema = z.object({
  inputType: z.enum(["text", "image"]).optional().default("text"),
  prompt: z.string().trim().min(1).max(600),
  imageUrl: z.string().trim().url().max(2000).optional().nullable(),
  sourceAssetId: z.string().uuid().optional().nullable(),
  provider: z.string().trim().min(1).max(40).optional().default("legacy"),
  targetFormats: z.array(z.enum(["glb", "obj", "fbx", "stl", "usdz", "3mf"])).min(1).max(3).optional().default(["glb"]),
  topology: z.enum(["triangle", "quad"]).optional().default("triangle"),
  poseMode: z.enum(["", "a-pose", "t-pose"]).optional().default(""),
}).refine((value) => {
  if (value.inputType === "text") return true;
  return typeof value.imageUrl === "string" && value.imageUrl.startsWith("https://");
}, {
  message: "Image to 3D requires an HTTPS imageUrl",
  path: ["imageUrl"],
});

export const generationJobParamsSchema = z.object({
  jobId: z.string().uuid(),
});

export const stationFileAssetSchema = z.object({
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().max(160).optional().default("text/plain"),
  byteSize: z.number().int().min(0).max(100 * 1024 * 1024).optional().nullable(),
  content: z.string().max(200_000).optional().default(""),
  metadata: z.record(z.any()).optional().default({}),
});

export const fileAssetParamsSchema = z.object({
  fileAssetId: z.string().uuid(),
});

export const stationComicDiaryRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  diaryEntryId: z.string().uuid().optional().nullable(),
  mediaAssetIds: z.array(z.string().uuid()).max(20).optional().default([]),
  fileAssetIds: z.array(z.string().uuid()).max(10).optional().default([]),
  style: z.enum(["slice-of-life", "cute", "manga", "storyboard"]).optional().default("slice-of-life"),
  frameCount: z.number().int().min(2).max(8).optional().default(4),
});

export const stationComicDiaryParamsSchema = z.object({
  comicDiaryId: z.string().uuid(),
});

export const stationVideoDraftRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  diaryEntryId: z.string().uuid().optional().nullable(),
  comicDiaryId: z.string().uuid().optional().nullable(),
  mediaAssetIds: z.array(z.string().uuid()).max(50).optional().default([]),
  fileAssetIds: z.array(z.string().uuid()).max(10).optional().default([]),
  format: z.enum(["short-clip", "vlog", "story", "promo"]).optional().default("short-clip"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional().default("9:16"),
  durationSeconds: z.number().int().min(10).max(180).optional().default(45),
});

export const locationResolveSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const scanPayloadSchema = z.object({
  payload: z.string().trim().min(1).max(500),
});

export const aiIdSchema = z.object({
  aiId: z.string().trim().regex(/^\d{12}$/),
});

export const friendRequestSchema = z.object({
  message: z.string().trim().max(200).optional().default(""),
});

export const relationshipTypeSchema = z.object({
  type: z.enum(["following", "followers", "friends"]),
});

export const profileVisibilitySchema = z.object({
  showBio: z.boolean().optional(),
  showAiId: z.boolean().optional(),
  showCounts: z.boolean().optional(),
  showCommunity: z.boolean().optional(),
  showActivityArea: z.boolean().optional(),
  showCollections: z.boolean().optional(),
  showPosts: z.boolean().optional(),
  showAlbum: z.boolean().optional(),
  showDiary: z.boolean().optional(),
  showMusic: z.boolean().optional(),
  showFiles: z.boolean().optional(),
  showFollowingList: z.boolean().optional(),
  showFollowersList: z.boolean().optional(),
});

export const searchHistorySchema = z.object({
  query: z.string().trim().min(1).max(120),
  scope: z.string().trim().min(1).max(40).optional().default("all"),
});

export const searchHistoryParamsSchema = z.object({
  historyId: z.string().uuid(),
});

export const searchUsersSchema = z.object({
  query: z.string().trim().min(1).max(120),
});

export const eventSchema = z.object({
  eventType: z.string().trim().min(1).max(80),
  targetType: z.string().trim().max(80).optional(),
  targetId: z.string().trim().max(120).optional(),
  payload: z.record(z.any()).optional().default({}),
});

export const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

export const incrementalSyncSchema = z.object({
  updatedAfter: z.string().datetime().optional(),
});

export const incrementalMessagesSchema = z.object({
  after: z.string().datetime().optional(),
});

export const userStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const userRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export const adminPermissionsSchema = z.object({
  permissions: z.array(z.enum([
    "*",
    "users:read",
    "users:write",
    "agents:manage",
    "audit:read",
    "model:operate",
  ])).max(16),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const createAdminUserSchema = z.object({
  email: z.string().email().max(190).transform((value) => value.toLowerCase().trim()),
  displayName: displayNameSchema,
  password: passwordSchema,
  role: z.enum(["user", "admin"]).optional().default("user"),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

export const profileAdminSchema = z.object({
  nickname: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).optional().default(""),
  community: z.string().trim().max(120).optional().default(""),
  activityArea: z.string().trim().max(120).optional().default(""),
});

export const agentAccessSchema = z.object({
  enabled: z.boolean(),
  alias: z.string().trim().max(80).optional().default(""),
  grantedScopes: z.array(z.string().trim().min(1).max(80)).optional().default([]),
});

export const selfAgentAccessSchema = z.object({
  enabled: z.boolean().optional().default(true),
  alias: z.string().trim().max(80).optional().default(""),
  grantedScopes: z.array(z.string().trim().min(1).max(80)).optional().default([]),
});

export const modelTestSchema = z.object({
  input: z.string().trim().min(1).max(500).optional(),
});
