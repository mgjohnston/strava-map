// Runtime config. Locally this empty stub is served as-is; on the preview platform nginx's
// exact-match `location = /config.js` renders the real one from the injected CARTO_API_KEY
// (preview.yaml `services.web.secrets`), overriding this file.
window.APP_CONFIG = { cartoApiKey: '' };
