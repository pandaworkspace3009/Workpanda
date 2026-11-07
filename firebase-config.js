/**
 * Firebase 設定（Web client config）。
 * Analytics（measurementId）已預留但不自動初始化，避免未登入環境出錯。
 * Firestore 文件路徑：workpanda/main
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyArtmK7RfE5EpUhw_ymmIGaXV0g0jmX_RQ",
  authDomain: "workpanda-9bf61.firebaseapp.com",
  projectId: "workpanda-9bf61",
  storageBucket: "workpanda-9bf61.firebasestorage.app",
  messagingSenderId: "572302668463",
  appId: "1:572302668463:web:4e035b217de400d6d15a5a",
  measurementId: "G-46EVSSLR1Z",
};

/** 設為 true 且上方設定齊備時，才允許切換至 Firestore 模式 */
window.isFirebaseConfigured = function () {
  const c = window.FIREBASE_CONFIG || {};
  return Boolean(c.apiKey && c.projectId && c.appId);
};

