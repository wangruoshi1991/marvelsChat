import { verifyPassword as verifyStoredPassword } from "./auth.js";
import {
  deleteUserAccount,
  findUserCredentialById,
  listUserStorageObjects,
} from "./account-repository.js";
import { HttpError } from "./http-error.js";
import { deletePrivateStorageObject } from "./storage-deletion-service.js";

export const deleteAccountStorageObject = deletePrivateStorageObject;

export function createAccountService({
  getCredential = findUserCredentialById,
  verifyPassword = verifyStoredPassword,
  listStorageObjects = listUserStorageObjects,
  deleteStorageObject = deleteAccountStorageObject,
  deleteUser = deleteUserAccount,
} = {}) {
  const deleteAccount = async ({ userId, password }) => {
    const credential = await getCredential(userId);
    if (!credential) throw new HttpError(404, "Account not found.");
    if (!await verifyPassword(password, credential.passwordHash)) {
      throw new HttpError(403, "Invalid password.", {
        code: "INVALID_ACCOUNT_PASSWORD",
      });
    }

    const uniqueObjects = new Map();
    for (const object of await listStorageObjects(userId)) {
      const provider = String(object.provider || "").trim().toLowerCase();
      const objectKey = String(object.objectKey || "").trim();
      if (provider && objectKey) {
        uniqueObjects.set(`${provider}\0${objectKey}`, { provider, objectKey });
      }
    }
    for (const object of uniqueObjects.values()) {
      await deleteStorageObject(object);
    }

    await deleteUser({ userId });
    return { deleted: true };
  };

  return { deleteAccount };
}

export const accountService = createAccountService();
