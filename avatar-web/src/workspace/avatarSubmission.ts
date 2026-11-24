import type { AvatarCreateJobInput } from "../types";

const slot = "miaoxun.avatar3d.submission.v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AvatarSubmission {
  owner: string;
  key: string;
  input: AvatarCreateJobInput;
}

export function clearAvatarSubmission() {
  try {
    sessionStorage.removeItem(slot);
    return true;
  } catch {
    return false;
  }
}

export function readAvatarSubmission(owner: string): AvatarSubmission | null {
  const raw = sessionStorage.getItem(slot);
  if (!raw) return null;
  let record: AvatarSubmission;
  try {
    record = JSON.parse(raw);
  } catch {
    clearAvatarSubmission();
    return null;
  }
  const input = record?.input;
  if (record?.owner !== owner || !uuid.test(record.key) || !input || !uuid.test(input.photoId) ||
      input.generationMode !== "face_first_multiview" || input.pose !== "natural" ||
      !["balanced", "slender", "athletic"].includes(input.bodyShape) ||
      !["business", "smart_casual", "casual", "sport", "formal"].includes(input.outfit) ||
      !["standard", "ultra"].includes(input.qualityPreset) || typeof input.userDescription !== "string" ||
      input.userDescription.length > 240 || typeof input.acceptedReferenceCostVersion !== "string" ||
      !input.acceptedReferenceCostVersion || input.acceptedPhotoRights !== true ||
      input.acceptedAdultSubject !== true || input.acceptedFaceCompletion !== true) {
    clearAvatarSubmission();
    return null;
  }
  return record;
}

export function saveAvatarSubmission(record: AvatarSubmission) {
  sessionStorage.setItem(slot, JSON.stringify(record));
}
