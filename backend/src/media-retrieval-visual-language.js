import crypto from "node:crypto";

// The deterministic visual path uses a closed vocabulary. Open descriptions
// require validated model parsing and preserved unknown spans before embedding.
export const MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION = "media-retrieval-visual-ontology-v3";
export const MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION = "media-retrieval-controlled-visual-grammar-v3";
export const MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION = "visual-v2";

const TYPE_ORDER = Object.freeze([
  "color",
  "clothing",
  "scene",
  "action",
  "object",
  "season",
  "medium",
]);

const englishSyntax = new Set([
  "a", "an", "and", "at", "by", "celebrity", "find", "for", "from", "image", "in", "is", "me", "of", "on",
  "photo", "photos", "picture", "pictures", "please", "search", "show", "the", "to", "video", "videos", "wear", "wearing", "worn", "with",
]);

const chineseSyntax = new Set([
  "一张", "一位", "中", "里", "照片中", "照片里", "图片中", "图片里", "图中", "图里", "的", "在", "穿", "穿着",
  "找", "寻找", "查找", "帮我", "显示", "给我", "我想要", "有", "和", "以及", "一个", "这张", "那张", "照片", "图片", "视频",
]);

const identityContextSyntax = new Set([
  "wear", "wearing", "worn", "by", "穿", "穿着",
]);

const locationSyntax = new Set(["on", "in", "at", "在"]);
const locationArticles = new Set(["a", "an", "the", "一张", "一个"]);
const controlledAttributeTypes = new Set(["color", "season"]);
const mediaSyntax = new Set(["photo", "photos", "picture", "pictures", "image", "video", "videos", "照片", "图片", "视频"]);

const visualTerms = new Map([
  ["yellow", { type: "color", value: "yellow" }],
  ["red", { type: "color", value: "red" }],
  ["blue", { type: "color", value: "blue" }],
  ["green", { type: "color", value: "green" }],
  ["black", { type: "color", value: "black" }],
  ["white", { type: "color", value: "white" }],
  ["pink", { type: "color", value: "pink" }],
  ["purple", { type: "color", value: "purple" }],
  ["orange", { type: "color", value: "orange" }],
  ["brown", { type: "color", value: "brown" }],
  ["gray", { type: "color", value: "gray" }],
  ["grey", { type: "color", value: "gray" }],
  ["dress", { type: "clothing", value: "dress" }],
  ["shirt", { type: "clothing", value: "shirt" }],
  ["tshirt", { type: "clothing", value: "t-shirt" }],
  ["t-shirt", { type: "clothing", value: "t-shirt" }],
  ["skirt", { type: "clothing", value: "skirt" }],
  ["jacket", { type: "clothing", value: "jacket" }],
  ["coat", { type: "clothing", value: "coat" }],
  ["pants", { type: "clothing", value: "pants" }],
  ["trousers", { type: "clothing", value: "pants" }],
  ["beach", { type: "scene", value: "beach" }],
  ["park", { type: "scene", value: "park" }],
  ["street", { type: "scene", value: "street" }],
  ["indoor", { type: "scene", value: "indoor" }],
  ["outdoor", { type: "scene", value: "outdoor" }],
  ["bicycle", { type: "object", value: "bicycle" }],
  ["bike", { type: "object", value: "bicycle" }],
  ["car", { type: "object", value: "car" }],
  ["umbrella", { type: "object", value: "umbrella" }],
  ["backpack", { type: "object", value: "backpack" }],
  ["cup", { type: "object", value: "cup" }],
  ["book", { type: "object", value: "book" }],
  ["computer", { type: "object", value: "computer" }],
  ["standing", { type: "action", value: "standing" }],
  ["sitting", { type: "action", value: "sitting" }],
  ["running", { type: "action", value: "running" }],
  ["holding", { type: "action", value: "holding" }],
  ["summer", { type: "season", value: "summer" }],
  ["winter", { type: "season", value: "winter" }],
  ["spring", { type: "season", value: "spring" }],
  ["autumn", { type: "season", value: "autumn" }],
  ["黄色", { type: "color", value: "yellow" }],
  ["红色", { type: "color", value: "red" }],
  ["蓝色", { type: "color", value: "blue" }],
  ["绿色", { type: "color", value: "green" }],
  ["黑色", { type: "color", value: "black" }],
  ["白色", { type: "color", value: "white" }],
  ["粉色", { type: "color", value: "pink" }],
  ["紫色", { type: "color", value: "purple" }],
  ["橙色", { type: "color", value: "orange" }],
  ["棕色", { type: "color", value: "brown" }],
  ["灰色", { type: "color", value: "gray" }],
  ["连衣裙", { type: "clothing", value: "dress" }],
  ["裙子", { type: "clothing", value: "skirt" }],
  ["衣服", { type: "clothing", value: "clothing" }],
  ["衬衫", { type: "clothing", value: "shirt" }],
  ["外套", { type: "clothing", value: "coat" }],
  ["裤子", { type: "clothing", value: "pants" }],
  ["沙滩", { type: "scene", value: "beach" }],
  ["海边", { type: "scene", value: "beach" }],
  ["公园", { type: "scene", value: "park" }],
  ["街道", { type: "scene", value: "street" }],
  ["室内", { type: "scene", value: "indoor" }],
  ["户外", { type: "scene", value: "outdoor" }],
  ["自行车", { type: "object", value: "bicycle" }],
  ["单车", { type: "object", value: "bicycle" }],
  ["汽车", { type: "object", value: "car" }],
  ["雨伞", { type: "object", value: "umbrella" }],
  ["背包", { type: "object", value: "backpack" }],
  ["杯子", { type: "object", value: "cup" }],
  ["书本", { type: "object", value: "book" }],
  ["电脑", { type: "object", value: "computer" }],
  ["站立", { type: "action", value: "standing" }],
  ["坐着", { type: "action", value: "sitting" }],
  ["跑步", { type: "action", value: "running" }],
  ["拿着", { type: "action", value: "holding" }],
  ["夏天", { type: "season", value: "summer" }],
  ["冬天", { type: "season", value: "winter" }],
  ["春天", { type: "season", value: "spring" }],
  ["秋天", { type: "season", value: "autumn" }],
]);

export const visualTermAliases = (canonicalValue) => [...visualTerms.entries()]
  .filter(([, clause]) => clause.value === canonicalValue)
  .map(([term]) => term);

const allChineseLexemes = [...new Set([...chineseSyntax, ...visualTerms.keys()].filter((value) => /\p{Script=Han}/u.test(value)))]
  .sort((left, right) => right.length - left.length || left.localeCompare(right));

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isHan = (value) => /\p{Script=Han}/u.test(value);
const punctuationOrWhitespace = (value) => /[\s,，。！？!?；;、:：()（）[\]{}"'“”‘’/\\-]/u.test(value);

export const normalizeVisualRawQuery = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .slice(0, 240);

const normalizedWord = (value) => String(value || "").toLocaleLowerCase();

const matchingChineseLexeme = (text, position) =>
  allChineseLexemes.find((lexeme) => text.startsWith(lexeme, position)) || null;

const spanRecord = ({ start, end, classification, type = null, value = null, text }) => ({
  start,
  end,
  classification,
  ...(type && value ? { clause: { type, value } } : {}),
  tokenHash: hash(normalizedWord(text.slice(start, end))),
});

const appendTyped = (spans, typedClauses, details) => {
  spans.push(spanRecord({ ...details, classification: "typed-visual" }));
  typedClauses.push({ type: details.type, value: details.value });
};

const appendSyntax = (spans, text, start, end) => {
  spans.push(spanRecord({ start, end, classification: "ignorable-syntax", text }));
};

const appendUnclassified = (spans, values, text, start, end) => {
  const term = text.slice(start, end).trim();
  spans.push(spanRecord({ start, end, classification: "unclassified", text }));
  if (term) values.push(term);
};

const appendUnclassifiedWithoutExactTerm = (spans, text, start, end) => {
  spans.push(spanRecord({ start, end, classification: "unclassified", text }));
};

const uniqueClauses = (clauses) => {
  const seen = new Set();
  return clauses
    .filter(({ type, value }) => TYPE_ORDER.includes(type) && typeof value === "string" && value)
    .filter((clause) => {
      const key = `${clause.type}:${clause.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type) || left.value.localeCompare(right.value));
};

const uniqueTerms = (values) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 12);

const coveragePayload = ({ rawQueryHash, rawLength, spans, typedClauses }) => ({
  ontologyVersion: MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
  grammarVersion: MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
  rawQueryHash,
  rawLength,
  spans,
  typedClauses,
});

export const serializeTypedVisualClauses = (clauses) => {
  const normalized = uniqueClauses(clauses);
  if (!normalized.length) return "";
  return `${MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION} ${normalized.map((clause) => `${clause.type}=${clause.value}`).join(";")}`;
};

const lexicalTokensFor = (raw) => {
  const tokens = [];
  let index = 0;

  while (index < raw.length) {
    const current = raw[index];
    if (punctuationOrWhitespace(current)) {
      tokens.push({ kind: "separator", start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (/[A-Za-z]/u.test(current)) {
      const match = raw.slice(index).match(/^[A-Za-z]+(?:['’-][A-Za-z]+)*/u);
      const word = match?.[0] || current;
      const normalized = normalizedWord(word);
      const known = visualTerms.get(normalized);
      if (known) {
        tokens.push({ kind: "visual", start: index, end: index + word.length, language: "english", ...known });
        index += word.length;
        continue;
      }
      if (englishSyntax.has(normalized)) {
        tokens.push({ kind: "syntax", start: index, end: index + word.length, normalized, language: "english" });
        index += word.length;
        continue;
      }
      let end = index + word.length;
      // Keep a multi-token unknown name/alias together for exact-only search,
      // but stop before a known term or grammar token.
      while (end < raw.length) {
        const gap = raw.slice(end).match(/^\s+/u)?.[0] || "";
        const nextStart = end + gap.length;
        const next = raw.slice(nextStart).match(/^[A-Za-z]+(?:['’-][A-Za-z]+)*/u)?.[0];
        if (!gap || !next) break;
        const nextLower = normalizedWord(next);
        if (visualTerms.has(nextLower) || englishSyntax.has(nextLower)) break;
        end = nextStart + next.length;
      }
      tokens.push({ kind: "unknown", start: index, end, language: "english" });
      index = end;
      continue;
    }
    if (isHan(current)) {
      const lexeme = matchingChineseLexeme(raw, index);
      if (lexeme) {
        const known = visualTerms.get(lexeme);
        if (known) tokens.push({ kind: "visual", start: index, end: index + lexeme.length, language: "han", ...known });
        else tokens.push({ kind: "syntax", start: index, end: index + lexeme.length, normalized: lexeme, language: "han" });
        index += lexeme.length;
        continue;
      }
      let end = index + 1;
      while (end < raw.length && isHan(raw[end]) && !matchingChineseLexeme(raw, end)) end += 1;
      tokens.push({ kind: "unknown", start: index, end, language: "han" });
      index = end;
      continue;
    }
    tokens.push({ kind: "unknown", start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
};

const isVisualType = (token, type) => token?.kind === "visual" && token.type === type;
const isLocationConnector = (token) => token?.kind === "syntax" && locationSyntax.has(token.normalized);
const isLocationArticle = (token) => token?.kind === "syntax" && locationArticles.has(token.normalized);

// Visual words must occupy a proved role: attributed clothing/object,
// a scene linked to an object, or a concrete subject in a media description.
// Unknown spans and identity-context connectors still veto full coverage.
const controlledVisualTokenIndexes = (tokens) => {
  const content = tokens.filter((token) => token.kind !== "separator");
  const allowed = new Set();
  const describesMedia = content.some((token) => token.kind === "syntax" && mediaSyntax.has(token.normalized));

  for (let index = 0; index < content.length; index += 1) {
    const token = content[index];
    const concrete = token.kind === "visual" && ["object", "clothing", "scene"].includes(token.type);
    if (!concrete) continue;
    const previous = content[index - 1];
    if (describesMedia || isLocationArticle(previous)) allowed.add(token);
    if (isVisualType(token, "object")) {
      let cursor = index + 1;
      if (isVisualType(content[cursor], "action")) cursor += 1;
      if (isLocationConnector(content[cursor])) {
        cursor += 1;
        if (isLocationArticle(content[cursor])) cursor += 1;
        if (isVisualType(content[cursor], "scene")) {
          allowed.add(token);
          allowed.add(content[cursor]);
          if (isVisualType(content[index + 1], "action")) allowed.add(content[index + 1]);
        }
      }
    }
    if (isVisualType(token, "scene") && content[index + 1]?.normalized === "里") {
      const subject = content[index + 2]?.normalized === "的" ? content[index + 3] : content[index + 2];
      if (isVisualType(subject, "object") || isVisualType(subject, "clothing")) {
        allowed.add(token);
        allowed.add(subject);
      }
    }
  }

  for (let index = 0; index < content.length; index += 1) {
    if (!isVisualType(content[index], "color") && !isVisualType(content[index], "season")) continue;
    const attributes = [];
    let cursor = index;
    while (controlledAttributeTypes.has(content[cursor]?.type) && content[cursor]?.kind === "visual") {
      attributes.push(content[cursor]);
      cursor += 1;
    }
    if (!attributes.length || !(isVisualType(content[cursor], "clothing") || isVisualType(content[cursor], "object"))) continue;

    for (const token of [...attributes, content[cursor]]) allowed.add(token);
    cursor += 1;
    if (isLocationConnector(content[cursor])) {
      cursor += 1;
      if (isLocationArticle(content[cursor])) cursor += 1;
      if (isVisualType(content[cursor], "scene")) allowed.add(content[cursor]);
    } else if (
      content[cursor - 1]?.language === "han" &&
      isVisualType(content[cursor], "scene") &&
      content[cursor]?.language === "han"
    ) {
      // Chinese visual phrases may concatenate the location after clothing,
      // e.g. `黄色连衣裙户外`; English requires an explicit location marker.
      allowed.add(content[cursor]);
    }
  }
  return allowed;
};

// The controlled grammar deliberately keeps identity-context connectors out of
// full visual coverage. They are not exact terms by themselves, but their
// occurrence makes a raw visual embedding unverifiable.
const isIdentityContextToken = (token) => token?.kind === "syntax" && identityContextSyntax.has(token.normalized);

const hasUnprovedIdentityContext = (tokens, raw) => {
  const content = tokens.filter((token) => token.kind !== "separator");
  for (let index = 0; index < content.length; index += 1) {
    const token = content[index];
    if (token.kind !== "unknown") continue;
    const previous = content[index - 1];
    const next = content[index + 1];
    const laterVisual = content.slice(index + 1).some((item) => item.kind === "visual");
    const earlierVisual = content.slice(0, index).some((item) => item.kind === "visual");
    // `with` also attaches parts to objects. Preserve that open description,
    // but keep a name-like English companion reference out of embeddings even
    // if the parser missed it. Other identities still require model parsing.
    if (token.language === "english" && previous?.normalized === "with" &&
      /^[A-Z]/u.test(raw.slice(token.start, token.end))) return true;
    if (token.language === "han" && earlierVisual && previous?.kind === "syntax" && ["的", "里"].includes(previous.normalized)) {
      return true;
    }
    if (token.language === "han" && !earlierVisual && laterVisual && next?.kind === "syntax" && next.normalized === "在") {
      return true;
    }
    if (token.language === "english" && /^[A-Z]/u.test(raw.slice(token.start, token.end)) && laterVisual &&
      next?.kind === "syntax" && ["on", "in", "at"].includes(next.normalized)) {
      return true;
    }
  }
  return false;
};

export function analyzeTypedVisualQuery(rawQuery) {
  const raw = normalizeVisualRawQuery(rawQuery);
  const tokens = lexicalTokensFor(raw);
  const allowedVisualTokens = controlledVisualTokenIndexes(tokens);
  const spans = [];
  const typedClauses = [];
  const unclassifiedTerms = [];
  const semanticRoleUnproved = tokens.some(isIdentityContextToken) || hasUnprovedIdentityContext(tokens, raw);

  for (const token of tokens) {
    if (token.kind === "separator") {
      appendSyntax(spans, raw, token.start, token.end);
    } else if (token.kind === "visual" && allowedVisualTokens.has(token)) {
      appendTyped(spans, typedClauses, { start: token.start, end: token.end, text: raw, type: token.type, value: token.value });
    } else if (token.kind === "syntax" && !isIdentityContextToken(token)) {
      appendSyntax(spans, raw, token.start, token.end);
    } else if (token.kind === "syntax") {
      appendUnclassifiedWithoutExactTerm(spans, raw, token.start, token.end);
    } else {
      appendUnclassified(spans, unclassifiedTerms, raw, token.start, token.end);
    }
  }

  const clauses = uniqueClauses(typedClauses);
  const rawQueryHash = hash(raw);
  const coverage = coveragePayload({
    rawQueryHash,
    rawLength: raw.length,
    spans,
    typedClauses: clauses,
  });
  return {
    rawQueryHash,
    rawLength: raw.length,
    typedClauses: clauses,
    coverage: spans,
    coverageDigest: hash(coverage),
    unclassifiedTerms: uniqueTerms(unclassifiedTerms),
    semanticRoleUnproved,
    complete: Boolean(raw) && spans.length > 0 && spans.every((span) => span.classification !== "unclassified"),
  };
}

const validClause = (clause) =>
  clause &&
  typeof clause === "object" &&
  !Array.isArray(clause) &&
  TYPE_ORDER.includes(clause.type) &&
  typeof clause.value === "string" &&
  visualTermsHas({ type: clause.type, value: clause.value });

const visualTermsHas = ({ type, value }) =>
  [...visualTerms.values()].some((entry) => entry.type === type && entry.value === value);

const validCoverageSpan = (span) => {
  if (!span || typeof span !== "object" || Array.isArray(span)) return false;
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(span.tokenHash || ""))) return false;
  if (!["typed-visual", "ignorable-syntax"].includes(span.classification)) return false;
  if (span.classification === "typed-visual") return validClause(span.clause);
  return !Object.hasOwn(span, "clause");
};

const validSemanticCoverageSpan = (span) => {
  if (!span || typeof span !== "object" || Array.isArray(span)) return false;
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(span.tokenHash || ""))) return false;
  if (!["typed-visual", "ignorable-syntax", "unclassified"].includes(span.classification)) return false;
  if (span.classification === "typed-visual") return validClause(span.clause);
  return !Object.hasOwn(span, "clause");
};

const verifyVisualCoverageRepresentation = ({
  rawQueryHash,
  rawLength,
  typedClauses,
  coverage,
  coverageDigest,
} = {}, { allowUnclassified = false, allowEmptyClauses = false } = {}) => {
  if (!/^[a-f0-9]{64}$/i.test(String(rawQueryHash || "")) || !Number.isInteger(rawLength) || rawLength <= 0) {
    throw new TypeError("Visual representation has invalid raw coverage metadata.");
  }
  if (!Array.isArray(typedClauses) || (!allowEmptyClauses && !typedClauses.length) || !typedClauses.every(validClause)) {
    throw new TypeError("Visual representation has invalid visual clauses.");
  }
  const normalizedClauses = uniqueClauses(typedClauses);
  if (normalizedClauses.length !== typedClauses.length || JSON.stringify(normalizedClauses) !== JSON.stringify(typedClauses)) {
    throw new TypeError("Visual representation clauses are not canonical.");
  }
  const validSpan = allowUnclassified ? validSemanticCoverageSpan : validCoverageSpan;
  if (!Array.isArray(coverage) || !coverage.length || !coverage.every(validSpan)) {
    throw new TypeError("Visual representation has invalid coverage spans.");
  }
  const coveredClauses = uniqueClauses(coverage
    .filter((span) => span.classification === "typed-visual")
    .map((span) => span.clause));
  if (JSON.stringify(coveredClauses) !== JSON.stringify(normalizedClauses)) {
    throw new TypeError("Visual representation clauses do not match covered spans.");
  }
  let cursor = 0;
  for (const span of coverage) {
    if (span.start !== cursor) throw new TypeError("Visual representation coverage is incomplete.");
    cursor = span.end;
  }
  if (cursor !== rawLength) throw new TypeError("Visual representation coverage is incomplete.");
  const expectedDigest = hash(coveragePayload({
    rawQueryHash: String(rawQueryHash).toLowerCase(),
    rawLength,
    spans: coverage,
    typedClauses: normalizedClauses,
  }));
  if (String(coverageDigest || "").toLowerCase() !== expectedDigest) {
    throw new TypeError("Visual representation coverage digest mismatch.");
  }
  return {
    rawQueryHash: String(rawQueryHash).toLowerCase(),
    rawLength,
    typedClauses: normalizedClauses,
    coverage,
    coverageDigest: expectedDigest,
  };
};

export function verifyTypedVisualRepresentation({ rawQueryHash, rawLength, typedClauses, coverage, coverageDigest } = {}) {
  return verifyVisualCoverageRepresentation({ rawQueryHash, rawLength, typedClauses, coverage, coverageDigest });
}

export function verifySemanticVisualRepresentation(value = {}) {
  return verifyVisualCoverageRepresentation(value, { allowUnclassified: true, allowEmptyClauses: true });
}
