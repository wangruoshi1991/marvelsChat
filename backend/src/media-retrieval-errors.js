import {
  assertMediaRetrievalPublicError,
  getMediaRetrievalPublicError,
  MEDIA_RETRIEVAL_ERROR_CONTRACTS,
} from "../../shared/media-retrieval-public-contract.js";

const ERROR_CONTRACTS = MEDIA_RETRIEVAL_ERROR_CONTRACTS;

const DIAGNOSTIC_OPERATIONS = new Set(["image-description", "query-parse", "query-rerank", "image-embedding", "query-embedding"]);
const DIAGNOSTIC_STAGES = new Set(["transport", "timeout", "http-response", "response-json", "descriptor-validation", "query-validation", "rerank-validation", "embedding-validation"]);
const DIAGNOSTIC_PROVIDER_CODES = new Set([
  "InvalidApiKey", "AccessDenied", "AccessDenied.Unpurchased", "InvalidParameter", "InvalidParameterValue",
  "ModelNotFound", "Throttling", "Throttling.RateQuota", "Throttling.AllocationQuota", "Arrearage",
  "DataInspectionFailed", "InternalError", "ServiceUnavailable", "unrecognized",
]);
const DIAGNOSTIC_SCHEMA_PATHS = new Set([
  "response", "response.policy", "summary", "clothing", "clothing[]", "clothing[].type", "clothing[].color",
  "scene", "scene[]", "actions", "actions[]", "objects", "objects[]", "ocrText", "ocrText[]",
  "qualitySignals", "qualitySignals[]", "visualQuery", "identityTerms", "identityTerms[]", "parseConfidence",
  "embedding",
  "matches", "matches[]", "matches[].candidateKey", "matches[].relevance",
]);

// Provider bodies, messages and arbitrary property names must never cross this
// projection. It is used both before persistence and before admin serialization.
export const projectMediaRetrievalDiagnostic = (input) => {
  if (!input || !DIAGNOSTIC_OPERATIONS.has(input.operation) || !DIAGNOSTIC_STAGES.has(input.stage)) return null;
  return {
    operation: input.operation,
    stage: input.stage,
    httpStatus: Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : null,
    providerCode: typeof input.providerCode === "string"
      ? DIAGNOSTIC_PROVIDER_CODES.has(input.providerCode) ? input.providerCode : "unrecognized"
      : null,
    schemaPaths: [...new Set((Array.isArray(input.schemaPaths) ? input.schemaPaths : [])
      .filter((path) => DIAGNOSTIC_SCHEMA_PATHS.has(path)))].slice(0, 10),
  };
};

export class MediaRetrievalRepositoryError extends Error {
  constructor(code = "retrieval_repository_write_failed") {
    const contract = ERROR_CONTRACTS[code] || ERROR_CONTRACTS.retrieval_repository_write_failed;
    super(contract.message);
    this.name = "MediaRetrievalRepositoryError";
    this.code = code;
    this.status = contract.status;
    this.retryable = contract.retryable;
  }
}

export const getMediaRetrievalErrorContract = (code) =>
  getMediaRetrievalPublicError(code);

export const toPublicMediaRetrievalError = (error) => {
  const contract = getMediaRetrievalErrorContract(error?.code);
  return assertMediaRetrievalPublicError({
    code: error?.code && ERROR_CONTRACTS[error.code] ? error.code : "retrieval_service_unavailable",
    message: contract.message,
    retryable: contract.retryable,
  }, { status: contract.status });
};

export const isMediaRetrievalPublicError = (error) =>
  Boolean(error?.name === "MediaRetrievalServiceError" || (typeof error?.code === "string" && error.code in ERROR_CONTRACTS));
