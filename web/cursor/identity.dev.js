// Cursor app identity: simulated viewer for local development only.
// Set to null so missing headers never become a fake admin (fail-closed).
// For local API testing with a simulated viewer, temporarily restore a DevViewer object.

/** @type {import("./identity.js").DevViewer | null} */
export const DEV_VIEWER = null;
