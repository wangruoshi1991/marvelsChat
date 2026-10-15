const cloneJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
};

const canSeeVisibility = (visibility, relation = {}) => {
  if (relation.isSelf) return true;
  if (visibility === "public") return true;
  if (visibility === "friends" && relation.isFriend) return true;
  return false;
};

const publicListEnabled = (publicProfile, key) =>
  Boolean(publicProfile?.relation?.isSelf || publicProfile?.visibility?.[key] !== false);

const sanitizeLayoutSectionReferences = ({ siteLayout, visibleMediaIds, visibleDiaryIds }) => {
  const layout = cloneJson(siteLayout, null);
  if (!layout || !Array.isArray(layout.sections)) return layout;

  layout.sections = layout.sections.map((section) => {
    const assetIds = (Array.isArray(section.assetIds) ? section.assetIds : []).filter((id) => visibleMediaIds.has(id));
    const diaryEntryIds = (Array.isArray(section.diaryEntryIds) ? section.diaryEntryIds : []).filter((id) => visibleDiaryIds.has(id));
    return {
      ...section,
      assetIds,
      diaryEntryIds,
      ...(layout.schemaVersion === 2 ? {
        actions: (Array.isArray(section.actions) ? section.actions : []).filter((action) =>
          action.kind === "interaction-intent" ||
          (action.kind === "view-media" && assetIds.includes(action.targetId)) ||
          (action.kind === "view-diary" && diaryEntryIds.includes(action.targetId))),
      } : {}),
    };
  });
  return layout;
};

const publicFileAssets = ({ publicProfile, stationContent, relation }) => {
  if (!publicListEnabled(publicProfile, "showFiles")) return [];
  return (stationContent.fileAssets || [])
    .filter((asset) => canSeeVisibility(asset.metadata?.visibility || "private", relation))
    .map((asset) => ({
      id: asset.id,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType || "",
      status: asset.status,
      preprocessingResult: asset.preprocessingResult
        ? {
          kind: asset.preprocessingResult.kind,
          stats: asset.preprocessingResult.stats ? {
            charCount: asset.preprocessingResult.stats.charCount,
            lineCount: asset.preprocessingResult.stats.lineCount,
          } : {},
        }
        : {},
    }));
};

const publicMediaAsset = (asset) => ({
  id: asset.id,
  albumId: asset.albumId || null,
  kind: asset.kind,
  mimeType: asset.mimeType || "",
  width: asset.width ?? null,
  height: asset.height ?? null,
  caption: asset.caption || "",
  status: asset.status,
  createdAt: asset.createdAt || null,
  updatedAt: asset.updatedAt || null,
});

const publicPost = (post) => ({
  id: post.id,
  userId: post.userId,
  body: post.body || "",
  locationLabel: post.locationLabel || "",
  visibility: post.visibility,
  agentCapabilities: Array.isArray(post.agentCapabilities) ? [...post.agentCapabilities] : [],
  likeCount: Number(post.likeCount || 0),
  commentCount: Number(post.commentCount || 0),
  favoriteCount: Number(post.favoriteCount || 0),
  likedByMe: post.likedByMe === true,
  favoritedByMe: post.favoritedByMe === true,
  media: (post.media || []).map(publicMediaAsset),
  createdAt: post.createdAt || null,
  updatedAt: post.updatedAt || null,
});

export function buildPublicStationView({ publicProfile, ownerProfile = {}, stationContent = {} } = {}) {
  const relation = publicProfile?.relation || {};
  const canShowAlbums = publicListEnabled(publicProfile, "showAlbum");
  const canShowDiary = publicListEnabled(publicProfile, "showDiary");
  const canShowPosts = publicListEnabled(publicProfile, "showPosts");

  const posts = canShowPosts
    ? (stationContent.posts || []).filter((post) =>
      canSeeVisibility(post.visibility || "private", relation)).map(publicPost)
    : [];

  const albums = canShowAlbums
    ? (stationContent.albums || []).filter((album) => canSeeVisibility(album.visibility || "private", relation))
    : [];
  const visibleAlbumIds = new Set(albums.map((album) => album.id));
  const visibleMediaAssets = canShowAlbums
    ? (stationContent.mediaAssets || []).filter((asset) => asset.albumId && visibleAlbumIds.has(asset.albumId))
    : [];
  const visibleMediaIds = new Set(visibleMediaAssets.map((asset) => asset.id));
  const mediaAssets = visibleMediaAssets.map(publicMediaAsset);

  const diaryEntries = canShowDiary
    ? (stationContent.diaryEntries || []).filter((entry) => canSeeVisibility(entry.visibility || "private", relation))
    : [];
  const visibleDiaryIds = new Set(diaryEntries.map((entry) => entry.id));

  // Generated copy can contain private source text even after resource IDs are
  // filtered. Applying a layout saves an owner-only page; it is not publication.
  const siteLayout = relation.isSelf === true
    ? sanitizeLayoutSectionReferences({
      siteLayout: ownerProfile?.stationConfig?.siteLayout || null,
      visibleMediaIds,
      visibleDiaryIds,
    })
    : null;

  return {
    user: cloneJson(publicProfile?.user || {}, {}),
    profile: cloneJson(publicProfile?.profile || {}, {}),
    relation: cloneJson(relation, {}),
    visibility: cloneJson(publicProfile?.visibility || {}, {}),
    siteLayout,
    stationContent: {
      posts: cloneJson(posts, []),
      albums: cloneJson(albums, []),
      mediaAssets: cloneJson(mediaAssets, []),
      diaryEntries: cloneJson(diaryEntries, []),
      fileAssets: publicFileAssets({ publicProfile, stationContent, relation }),
      comicDiaries: [],
      videoDrafts: [],
    },
  };
}
