import crypto from "node:crypto";

export const MEDIA_RETRIEVAL_DESCRIPTOR_PROVENANCE_VERSION = "media-retrieval-descriptor-provenance-v1";
export const MEDIA_RETRIEVAL_EMBEDDING_PROVENANCE_VERSION = "media-retrieval-embedding-provenance-v1";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

const canonicalValue = (value) => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
};

const canonicalHash = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(canonicalValue(value)))
  .digest("hex");

const requiredString = (value, label, maximum = 160) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum) {
    throw new TypeError(`Media retrieval ${label} is required.`);
  }
  return normalized;
};

const requiredDimension = (value) => {
  const dimension = Number(value);
  if (!Number.isInteger(dimension) || dimension !== 1024) {
    throw new TypeError("Media retrieval embedding provenance dimension must be 1024.");
  }
  return dimension;
};

const assertConfigurationHash = (value, label) => {
  const hash = String(value || "").toLowerCase();
  if (!HASH_PATTERN.test(hash)) {
    throw new TypeError(`Media retrieval ${label} provenance has an invalid configuration hash.`);
  }
  return hash;
};

const descriptorConfigurationPayload = ({ modelId, modelVersion, configuration }) => ({
  kind: "media-retrieval-descriptor-configuration-v1",
  modelId,
  modelVersion,
  configuration: canonicalValue(configuration && typeof configuration === "object" && !Array.isArray(configuration) ? configuration : {}),
});

const embeddingConfigurationPayload = ({ modelId, modelVersion, dimension, normalization, configuration }) => ({
  kind: "media-retrieval-embedding-configuration-v1",
  modelId,
  modelVersion,
  dimension,
  normalization,
  configuration: canonicalValue(configuration && typeof configuration === "object" && !Array.isArray(configuration) ? configuration : {}),
});

export function createDescriptorProvenance({ modelId, modelVersion, configuration = {} } = {}) {
  const normalizedModelId = requiredString(modelId, "descriptor model id");
  const normalizedModelVersion = requiredString(modelVersion, "descriptor model version");
  return {
    provenanceVersion: MEDIA_RETRIEVAL_DESCRIPTOR_PROVENANCE_VERSION,
    modelId: normalizedModelId,
    modelVersion: normalizedModelVersion,
    configurationHash: canonicalHash(descriptorConfigurationPayload({
      modelId: normalizedModelId,
      modelVersion: normalizedModelVersion,
      configuration,
    })),
  };
}

export function createEmbeddingProvenance({
  modelId,
  modelVersion,
  dimension,
  normalization,
  configuration = {},
} = {}) {
  const normalizedModelId = requiredString(modelId, "embedding model id");
  const normalizedModelVersion = requiredString(modelVersion, "embedding model version");
  const normalizedDimension = requiredDimension(dimension);
  const normalizedNormalization = requiredString(normalization, "embedding normalization", 80);
  return {
    provenanceVersion: MEDIA_RETRIEVAL_EMBEDDING_PROVENANCE_VERSION,
    modelId: normalizedModelId,
    modelVersion: normalizedModelVersion,
    dimension: normalizedDimension,
    normalization: normalizedNormalization,
    configurationHash: canonicalHash(embeddingConfigurationPayload({
      modelId: normalizedModelId,
      modelVersion: normalizedModelVersion,
      dimension: normalizedDimension,
      normalization: normalizedNormalization,
      configuration,
    })),
  };
}

export function assertDescriptorProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Media retrieval descriptor provenance is required.");
  }
  if (value.provenanceVersion !== MEDIA_RETRIEVAL_DESCRIPTOR_PROVENANCE_VERSION) {
    throw new TypeError("Media retrieval descriptor provenance version is unsupported.");
  }
  return {
    provenanceVersion: value.provenanceVersion,
    modelId: requiredString(value.modelId, "descriptor model id"),
    modelVersion: requiredString(value.modelVersion, "descriptor model version"),
    configurationHash: assertConfigurationHash(value.configurationHash, "descriptor"),
  };
}

export function assertEmbeddingProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Media retrieval embedding provenance is required.");
  }
  if (value.provenanceVersion !== MEDIA_RETRIEVAL_EMBEDDING_PROVENANCE_VERSION) {
    throw new TypeError("Media retrieval embedding provenance version is unsupported.");
  }
  return {
    provenanceVersion: value.provenanceVersion,
    modelId: requiredString(value.modelId, "embedding model id"),
    modelVersion: requiredString(value.modelVersion, "embedding model version"),
    dimension: requiredDimension(value.dimension),
    normalization: requiredString(value.normalization, "embedding normalization", 80),
    configurationHash: assertConfigurationHash(value.configurationHash, "embedding"),
  };
}

export function assertIndexingProvenance({ descriptorProvenance, embeddingProvenance } = {}) {
  return {
    descriptorProvenance: assertDescriptorProvenance(descriptorProvenance),
    embeddingProvenance: assertEmbeddingProvenance(embeddingProvenance),
  };
}

export const embeddingSpaceFor = (value) => {
  const provenance = assertEmbeddingProvenance(value);
  return {
    modelId: provenance.modelId,
    modelVersion: provenance.modelVersion,
    dimension: provenance.dimension,
    normalization: provenance.normalization,
    configurationHash: provenance.configurationHash,
  };
};

export const embeddingSpaceHashFor = (value) => canonicalHash({
  kind: "media-retrieval-embedding-space-v1",
  ...embeddingSpaceFor(value),
});

export function assertMatchingEmbeddingSpace(actual, expected) {
  const actualSpace = embeddingSpaceFor(actual);
  const expectedSpace = embeddingSpaceFor(expected);
  if (JSON.stringify(actualSpace) !== JSON.stringify(expectedSpace)) {
    throw new TypeError("Media retrieval embedding space does not match the frozen provenance.");
  }
  return actualSpace;
}

export const provenanceDigestFor = ({ descriptorProvenance, embeddingProvenance } = {}) => canonicalHash({
  kind: "media-retrieval-indexing-provenance-v1",
  ...assertIndexingProvenance({ descriptorProvenance, embeddingProvenance }),
});
