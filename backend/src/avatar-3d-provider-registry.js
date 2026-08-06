import { HttpError } from "./http-error.js";

export function createAvatar3dProviderRegistry({ tripo }) {
  const providers = new Map([["tripo", tripo]]);

  return {
    resolve(name) {
      const provider = providers.get(name);
      if (!provider) {
        throw new HttpError(500, "Unsupported avatar provider.", {
          code: "AVATAR_PROVIDER_UNSUPPORTED",
        });
      }
      return provider;
    },
  };
}
