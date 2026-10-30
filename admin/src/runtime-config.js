// The isolated development launcher owns port 4391. Keep the browser-side
// fallback in one place so the file:// entry point and the Vite proxy cannot
// drift apart again.
export const DEFAULT_LOCAL_API_ORIGIN = "http://127.0.0.1:4391";
