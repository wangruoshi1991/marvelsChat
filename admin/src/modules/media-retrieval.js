export function mediaRetrievalControlRevision(controls) {
  const revision = controls?.revision;
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}
