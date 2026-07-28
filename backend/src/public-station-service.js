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

  layout.sections = layout.sections.map((section) => ({
    ...section,
    assetIds: (Array.isArray(section.assetIds) ? section.assetIds : []).filter((id) => visibleMediaIds.has(id)),
    diaryEntryIds: (Array.isArray(section.diaryEntryIds) ? section.diaryEntryIds : []).filter((id) => visibleDiaryIds.has(id)),
  }));
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
          title: asset.preprocessingResult.title,
          summary: asset.preprocessingResult.summary,
          tags: Array.isArray(asset.preprocessingResult.tags) ? asset.preprocessingResult.tags.slice(0, 8) : [],
          stats: asset.preprocessingResult.stats || {},
        }
        : {},
    }));
};

export function buildPublicStationView({ publicProfile, ownerProfile = {}, stationContent = {} } = {}) {
  const relation = publicProfile?.relation || {};
  const canShowAlbums = publicListEnabled(publicProfile, "showAlbum");
  const canShowDiary = publicListEnabled(publicProfile, "showDiary");
  const canShowPosts = publicListEnabled(publicProfile, "showPosts");

  const posts = canShowPosts
    ? (stationContent.posts || []).filter((post) =>
      canSeeVisibility(post.visibility || "private", relation))
    : [];

  const albums = canShowAlbums
    ? (stationContent.albums || []).filter((album) => canSeeVisibility(album.visibility || "private", relation))
    : [];
  const visibleAlbumIds = new Set(albums.map((album) => album.id));
  const mediaAssets = canShowAlbums
    ? (stationContent.mediaAssets || []).filter((asset) => asset.albumId && visibleAlbumIds.has(asset.albumId))
    : [];
  const visibleMediaIds = new Set(mediaAssets.map((asset) => asset.id));

  const diaryEntries = canShowDiary
    ? (stationContent.diaryEntries || []).filter((entry) => canSeeVisibility(entry.visibility || "private", relation))
    : [];
  const visibleDiaryIds = new Set(diaryEntries.map((entry) => entry.id));

  const siteLayout = sanitizeLayoutSectionReferences({
    siteLayout: ownerProfile?.stationConfig?.siteLayout || null,
    visibleMediaIds,
    visibleDiaryIds,
  });

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
      modelAssets: [],
      comicDiaries: [],
      videoDrafts: [],
    },
  };
}
