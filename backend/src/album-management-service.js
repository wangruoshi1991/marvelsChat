const domainKeywords = [
  "滨江",
  "黄昏",
  "咖啡",
  "生活",
  "周末",
  "旅行",
  "校园",
  "朋友",
  "家人",
  "美食",
  "漫画日记",
  "日记",
  "视频",
  "3D",
  "上海",
];

const stopWords = new Set(["image", "video", "jpg", "jpeg", "png", "webp", "heic", "照片", "图片"]);

const sanitizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/[<>{}[\]()"']/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);

export function normalizeMediaTags(tags = []) {
  return Array.from(new Set(
    (Array.isArray(tags) ? tags : [])
      .map(sanitizeTag)
      .filter(Boolean),
  )).slice(0, 12);
}

const searchableText = (asset = {}) =>
  [
    asset.originalFilename,
    asset.caption,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();

function inferFilenameWords(filename = "") {
  return String(filename || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^a-z0-9\u3400-\u9fff]+/i)
    .map(sanitizeTag)
    .filter((item) => item && !stopWords.has(item))
    .slice(0, 5);
}

export function suggestTagsForMediaAsset(asset = {}) {
  const text = searchableText(asset);
  const domainTags = domainKeywords.filter((keyword) => text.includes(keyword.toLowerCase()));
  const filenameTags = inferFilenameWords(asset.originalFilename);
  return normalizeMediaTags([
    asset.kind || "media",
    ...domainTags,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
    ...filenameTags,
  ]);
}

export function buildMediaSearchMatcher(query = "") {
  const terms = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return (asset) => {
    if (!terms.length) return true;
    const text = searchableText(asset);
    return terms.every((term) => text.includes(term));
  };
}

function albumTitleForTag(tag) {
  if (["上海", "滨江", "黄昏", "旅行"].includes(tag)) return `${tag}影像`;
  if (["咖啡", "生活", "周末", "美食"].includes(tag)) return `${tag}生活`;
  if (["漫画日记", "日记"].includes(tag)) return `${tag}素材`;
  if (tag === "视频") return "视频素材";
  return `${tag}相册`;
}

export function buildAlbumSuggestions({ mediaAssets = [] } = {}) {
  const buckets = new Map();
  for (const asset of mediaAssets) {
    if (asset.albumId) continue;
    const tags = suggestTagsForMediaAsset(asset).filter((tag) => tag !== asset.kind);
    const primary = tags.find((tag) => domainKeywords.includes(tag)) || tags[0] || "未整理";
    if (!buckets.has(primary)) {
      buckets.set(primary, []);
    }
    buckets.get(primary).push(asset);
  }

  return Array.from(buckets.entries())
    .map(([tag, assets]) => ({
      title: albumTitleForTag(tag),
      description: `根据 ${tag} 标签自动建议整理。`,
      tags: normalizeMediaTags([tag, ...assets.flatMap((asset) => suggestTagsForMediaAsset(asset))]),
      mediaAssetIds: assets.map((asset) => asset.id),
      confidence: Math.min(0.95, 0.55 + assets.length * 0.1),
      source: "agent-rule",
    }))
    .sort((a, b) => b.mediaAssetIds.length - a.mediaAssetIds.length || b.confidence - a.confidence)
    .slice(0, 8);
}
