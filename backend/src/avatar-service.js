import crypto from "crypto";

const avatarOptions = {
  body: ["compact", "standard", "tall", "strong"],
  face: ["soft", "oval", "angular", "round"],
  skinTone: ["porcelain", "warm", "tan", "deep"],
  hairStyle: ["short", "bob", "wave", "curly", "undercut"],
  hairColor: ["black", "brown", "copper", "silver", "blue"],
  outfit: ["street", "campus", "tech", "artist", "sport"],
  accent: ["sunrise", "mint", "sky", "rose", "violet"],
  expression: ["calm", "smile", "focus"],
  accessory: ["none", "glasses", "cap", "headphones", "spark"],
  pose: ["casual", "hello", "ready"],
  eyeStyle: ["round", "bright", "calm", "sharp"],
  browStyle: ["soft", "straight", "bold", "tilt"],
  mouthStyle: ["smile", "calm", "confident", "cute"],
  top: ["hoodie", "shirt", "jacket", "sweater", "uniform"],
  bottom: ["cargo", "jeans", "shorts", "skirt", "track"],
  shoes: ["sneaker", "boot", "canvas", "runner"],
  action: ["stand", "cross-arms", "wave", "soccer", "question", "sit"],
};

const legacyPaletteToAccent = {
  sunrise: "sunrise",
  mint: "mint",
  sky: "sky",
  grape: "violet",
  mono: "mint",
};

const pick = (items, byte) => items[byte % items.length];

const hashSeed = (seed) =>
  crypto.createHash("sha256").update(String(seed || "miaoxun-avatar")).digest();

export function createAvatarConfig(seed) {
  const hash = hashSeed(seed);
  return {
    version: 2,
    seed: crypto.createHash("sha1").update(String(seed || "")).digest("hex").slice(0, 12),
    body: pick(avatarOptions.body, hash[0]),
    face: pick(avatarOptions.face, hash[1]),
    skinTone: pick(avatarOptions.skinTone, hash[2]),
    hairStyle: pick(avatarOptions.hairStyle, hash[3]),
    hairColor: pick(avatarOptions.hairColor, hash[4]),
    outfit: pick(avatarOptions.outfit, hash[5]),
    accent: pick(avatarOptions.accent, hash[6]),
    expression: pick(avatarOptions.expression, hash[7]),
    accessory: pick(avatarOptions.accessory, hash[8]),
    pose: pick(avatarOptions.pose, hash[9]),
    eyeStyle: pick(avatarOptions.eyeStyle, hash[10]),
    browStyle: pick(avatarOptions.browStyle, hash[11]),
    mouthStyle: pick(avatarOptions.mouthStyle, hash[12]),
    top: pick(avatarOptions.top, hash[13]),
    bottom: pick(avatarOptions.bottom, hash[14]),
    shoes: pick(avatarOptions.shoes, hash[15]),
    action: pick(avatarOptions.action, hash[16]),
  };
}

const safeOption = (options, value, fallback) =>
  options.includes(value) ? value : fallback;

export function normalizeAvatarConfig(config = {}, seed = "") {
  const generated = createAvatarConfig(seed || config.seed || "miaoxun-avatar");
  return {
    version: 2,
    seed: typeof config.seed === "string" && config.seed.trim() ? config.seed.trim().slice(0, 40) : generated.seed,
    body: safeOption(avatarOptions.body, config.body, generated.body),
    face: safeOption(avatarOptions.face, config.face, generated.face),
    skinTone: safeOption(avatarOptions.skinTone, config.skinTone, generated.skinTone),
    hairStyle: safeOption(avatarOptions.hairStyle, config.hairStyle, generated.hairStyle),
    hairColor: safeOption(avatarOptions.hairColor, config.hairColor, generated.hairColor),
    outfit: safeOption(avatarOptions.outfit, config.outfit, generated.outfit),
    accent: safeOption(avatarOptions.accent, config.accent || legacyPaletteToAccent[config.palette], generated.accent),
    expression: safeOption(avatarOptions.expression, config.expression, generated.expression),
    accessory: safeOption(avatarOptions.accessory, config.accessory, generated.accessory),
    pose: safeOption(avatarOptions.pose, config.pose, generated.pose),
    eyeStyle: safeOption(avatarOptions.eyeStyle, config.eyeStyle, generated.eyeStyle),
    browStyle: safeOption(avatarOptions.browStyle, config.browStyle, generated.browStyle),
    mouthStyle: safeOption(
      avatarOptions.mouthStyle,
      config.mouthStyle || (config.expression === "focus" ? "confident" : config.expression),
      generated.mouthStyle,
    ),
    top: safeOption(
      avatarOptions.top,
      config.top ||
        (config.outfit === "campus"
          ? "uniform"
          : config.outfit === "tech"
            ? "jacket"
            : config.outfit === "artist"
              ? "shirt"
              : config.outfit === "sport"
                ? "sweater"
                : "hoodie"),
      generated.top,
    ),
    bottom: safeOption(
      avatarOptions.bottom,
      config.bottom || (config.outfit === "sport" ? "track" : config.outfit === "artist" ? "shorts" : "cargo"),
      generated.bottom,
    ),
    shoes: safeOption(avatarOptions.shoes, config.shoes, generated.shoes),
    action: safeOption(
      avatarOptions.action,
      config.action ||
        (config.pose === "hello" ? "wave" : config.pose === "ready" ? "cross-arms" : "stand"),
      generated.action,
    ),
  };
}
