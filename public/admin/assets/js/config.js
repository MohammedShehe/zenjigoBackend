/*
 * ZenjiGO Admin runtime configuration.
 *
 * - When this console is served by the backend (https://<api-host>/admin) it automatically
 *   talks to the same origin at /api/v1 — nothing to configure.
 * - When it is hosted separately (e.g. GitHub Pages / CNAME), set apiBase below to the
 *   public HTTPS URL of the API, and add this site's origin to CORS_ORIGINS in the backend .env.
 */
window.ZENJIGO_ADMIN_CONFIG = {
  apiBase: '' // e.g. 'https://zenjigo-backend.onrender.com/api/v1'
};
