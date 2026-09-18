import { NativeModules } from 'react-native';

// This release includes the native retrieval workspace. Runtime availability
// still requires the registered Agent, readiness and authenticated status API.
export const appFeatures = Object.freeze({ mediaRetrievalV1: true });

export function supportsMediaRetrieval(
  buildNumber: unknown = NativeModules.MiaoxunConfigModule?.buildNumber,
) {
  const build = String(buildNumber ?? '');
  return (
    appFeatures.mediaRetrievalV1 && /^\d+$/.test(build) && Number(build) >= 26
  );
}
