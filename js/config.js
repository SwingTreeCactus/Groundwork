/* RV app: build settings. Paste your Google OAuth client ID between the quotes to turn on Google Drive backup. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  RV.config = { googleClientId: root.__RV_CLIENT_ID || '' };
})(typeof window !== 'undefined' ? window : globalThis);
