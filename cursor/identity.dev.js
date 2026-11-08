// Cursor app identity: simulated viewer for local development only.
// Fail-closed: null means missing headers are unverified (not a fake admin).

/** @type {import("./identity.js").DevViewer | null} */
export const DEV_VIEWER = null;
