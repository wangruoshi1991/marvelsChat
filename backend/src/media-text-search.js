// Literal search over stored filenames, captions and user-supplied tags.
// Visual understanding is provided separately by the authorized image index.
export function buildMediaSearchMatcher(query = "") {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return asset => {
    if (!terms.length) return true;
    const text = [asset.originalFilename, asset.caption, ...(Array.isArray(asset.tags) ? asset.tags : [])]
      .filter(value => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return terms.every(term => text.includes(term));
  };
}
