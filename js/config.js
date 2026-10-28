/* RV app: build settings. Paste your Google OAuth client ID between the quotes to turn on Google Drive backup. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  RV.config = {
    googleClientId: root.__RV_CLIENT_ID || '819898356569-343h0rk2ibiffu6qk7kmq3c860j85nqp.apps.googleusercontent.com',
    // The sign-in helper (worker/token-helper.js on Cloudflare). Set it to keep Drive connected; empty = one-hour sign-ins.
    tokenHelper: root.__RV_TOKEN_HELPER != null ? root.__RV_TOKEN_HELPER : 'https://groundwork-auth.swingtreecactus.workers.dev',
    // The note cleanup helper (worker/ai-proxy.js on Cloudflare). It holds a shared Claude key; empty = each person adds their own key.
    aiProxy: root.__RV_AI_PROXY != null ? root.__RV_AI_PROXY : 'https://groundwork-ai.swingtreecactus.workers.dev',
  };
})(typeof window !== 'undefined' ? window : globalThis);
