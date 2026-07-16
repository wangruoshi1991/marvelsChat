import { verifyPassword as verifyStoredPassword } from "./auth.js";
import { deleteOssObject } from "./oss-service.js";
import {
  deleteUserAccount,
  findUserCredentialById,
  listUserStorageKeys,
} from "./repositories.js";
import { HttpError } from "./http-error.js";

export function createAccountService({
  getCredential = findUserCredentialById,
  verifyPassword = verifyStoredPassword,
  listStorageKeys = listUserStorageKeys,
  deleteStorageObject = deleteOssObject,
  deleteUser = deleteUserAccount,
} = {}) {
  const deleteAccount = async ({ userId, password }) => {
    const credential = await getCredential(userId);
    if (!credential) throw new HttpError(404, "Account not found.");
    if (!await verifyPassword(password, credential.passwordHash)) {
      throw new HttpError(401, "Invalid password.");
    }

    const storageKeys = Array.from(new Set(
      (await listStorageKeys(userId)).map((item) => String(item || "").trim()).filter(Boolean),
    ));
    for (const objectKey of storageKeys) {
      await deleteStorageObject({ objectKey });
    }
    await deleteUser({ userId });
    return { deleted: true };
  };

  return { deleteAccount };
}

export const accountService = createAccountService();
