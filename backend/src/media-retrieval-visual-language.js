import crypto from "node:crypto";

// The embedding boundary accepts only this closed vocabulary. It deliberately
// does not attempt to recognize names: every unclassified semantic span is
// withheld from visual embedding instead of being guessed from lexical form.
export const MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION = "media-retrieval-visual-ontology-v2";
export const MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION = "media-retrieval-controlled-visual-grammar-v1";
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
  "photo", "picture", "please", "search", "show", "the", "to", "video", "wear", "wearing", "worn", "with",
]);

const chineseSyntax = new Set([
  "一张", "一位", "中", "里", "照片中", "照片里", "图片中", "图片里", "图中", "图里", "的", "在", "穿", "穿着",
  "找", "寻找", "显示", "给我", "我想要", "有", "和", "以及", "一个", "这张", "那张",
]);

const identityContextSyntax = new Set([
  "wear", "wearing", "worn", "with", "by", "穿", "穿着",
]);

const locationSyntax = new Set(["on", "in", "at", "在"]);
const locationArticles = new Set(["a", "an", "the", "一张", "一个"]);
const controlledAttributeTypes = new Set(["color", "season"]);

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
  ["站立", { type: "action", value: "standing" }],
  ["坐着", { type: "action", value: "sitting" }],
  ["跑步", { type: "action", value: "running" }],
  ["拿着", { type: "action", value: "holding" }],
  ["夏天", { type: "season", value: "summer" }],
  ["冬天", { type: "season", value: "winter" }],
  ["春天", { type: "season", value: "spring" }],
  ["秋天", { type: "season", value: "autumn" }],
]);

const allChineseLexemes = [...new Set([...chineseSyntax, ...visualTerms.keys()].filter((value) => /\p{Script=Han}/u.test(value)))]
  .sort((left, right) => right.length - left.length || left.localeCompare(right));

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isHan = (value) => /\p{Script=Han}/u.test(value);
const punctuationOrWhitespace = (value) => /[\s,，。！？!?；;、:：()（）\[\]{}"'“”‘’/\\-]/u.test(value);

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

// A visual clause is a deliberately small role grammar, not a per-word
// allow-list: `(color|season)+ clothing [location scene]`. Any matching word
// outside that role remains exact-only. This makes `Summer wearing yellow`
// fundamentally different from `summer yellow dress` without naming either
// person or place.
const controlledVisualTokenIndexes = (tokens) => {
  const content = tokens.filter((token) => token.kind !== "separator");
  const allowed = new Set();

  for (let index = 0; index < content.length; index += 1) {
    if (!isVisualType(content[index], "color") && !isVisualType(content[index], "season")) continue;
    const attributes = [];
    let cursor = index;
    while (controlledAttributeTypes.has(content[cursor]?.type) && content[cursor]?.kind === "visual") {
      attributes.push(content[cursor]);
      cursor += 1;
    }
    if (!attributes.length || !isVisualType(content[cursor], "clothing")) continue;

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

export function analyzeTypedVisualQuery(rawQuery) {
  const raw = normalizeVisualRawQuery(rawQuery);
  const tokens = lexicalTokensFor(raw);
  const allowedVisualTokens = controlledVisualTokenIndexes(tokens);
  const spans = [];
  const typedClauses = [];
  const unclassifiedTerms = [];
  const semanticRoleUnproved = tokens.some(isIdentityContextToken);

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

export function verifyTypedVisualRepresentation({ rawQueryHash, rawLength, typedClauses, coverage, coverageDigest } = {}) {
  if (!/^[a-f0-9]{64}$/i.test(String(rawQueryHash || "")) || !Number.isInteger(rawLength) || rawLength <= 0) {
    throw new TypeError("Typed visual representation has invalid raw coverage metadata.");
  }
  if (!Array.isArray(typedClauses) || !typedClauses.length || !typedClauses.every(validClause)) {
    throw new TypeError("Typed visual representation has invalid visual clauses.");
  }
  const normalizedClauses = uniqueClauses(typedClauses);
  if (normalizedClauses.length !== typedClauses.length || JSON.stringify(normalizedClauses) !== JSON.stringify(typedClauses)) {
    throw new TypeError("Typed visual representation clauses are not canonical.");
  }
  if (!Array.isArray(coverage) || !coverage.length || !coverage.every(validCoverageSpan)) {
    throw new TypeError("Typed visual representation has invalid coverage spans.");
  }
  let cursor = 0;
  for (const span of coverage) {
    if (span.start !== cursor) throw new TypeError("Typed visual representation coverage is incomplete.");
    cursor = span.end;
  }
  if (cursor !== rawLength) throw new TypeError("Typed visual representation coverage is incomplete.");
  const expectedDigest = hash(coveragePayload({
    rawQueryHash: String(rawQueryHash).toLowerCase(),
    rawLength,
    spans: coverage,
    typedClauses: normalizedClauses,
  }));
  if (String(coverageDigest || "").toLowerCase() !== expectedDigest) {
    throw new TypeError("Typed visual representation coverage digest mismatch.");
  }
  return {
    rawQueryHash: String(rawQueryHash).toLowerCase(),
    rawLength,
    typedClauses: normalizedClauses,
    coverage,
    coverageDigest: expectedDigest,
  };
}
