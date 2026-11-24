import { verifyPassword as verifyStoredPassword } from "./auth.js";
import {
  deleteUserAccount,
  findUserCredentialById,
} from "./account-repository.js";
import { HttpError } from "./http-error.js";
import { deletePrivateStorageObject } from "./storage-deletion-service.js";

export const deleteAccountStorageObject = deletePrivateStorageObject;

export function createAccountService({
  getCredential = findUserCredentialById,
  verifyPassword = verifyStoredPassword,
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

    return deleteUser({ userId, expectedPasswordHash: credential.passwordHash });
  };

  return { deleteAccount };
}

export const accountService = createAccountService();
