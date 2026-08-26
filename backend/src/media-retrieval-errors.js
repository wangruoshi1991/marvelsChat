import {
  assertMediaRetrievalPublicError,
  getMediaRetrievalPublicError,
  MEDIA_RETRIEVAL_ERROR_CONTRACTS,
} from "../../shared/media-retrieval-public-contract.js";

const ERROR_CONTRACTS = MEDIA_RETRIEVAL_ERROR_CONTRACTS;

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
