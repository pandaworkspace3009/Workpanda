/**
 * Firebase 設定（Web client config）。
 * 已發佈版本刻意留空：不嵌入正式專案憑證，亦唔會自動連 Firestore。
 * 本機／自架若要啟用雲端同步，請自行填入憑證，並先加 Firebase Auth + Firestore rules。
 * Firestore 文件路徑（如啟用）：workpanda/main
 */
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

/** 設為 true 且上方設定齊備時，才允許切換至 Firestore 模式 */
window.isFirebaseConfigured = function () {
  const c = window.FIREBASE_CONFIG || {};
  return Boolean(c.apiKey && c.projectId && c.appId);
};
