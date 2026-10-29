const helmet = require('helmet');

// Space-separated CSP sources allowed to embed Flame in a frame,
// e.g. "'self' https://organizr.example.com". Defaults to same-origin only.
const frameAncestors = (process.env.FRAME_ANCESTORS || '')
  .split(/\s+/)
  .filter(Boolean);

const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'script-src-attr': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': frameAncestors.length ? frameAncestors : ["'self'"],
      // App/bookmark icons may be any remote image URL (often plain http on a LAN)
      'img-src': ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      // Remote SVG icons are fetched by the SvgIcon component, the
      // version check hits GitHub, and the weather widget uses a WebSocket
      'connect-src': ["'self'", 'http:', 'https:', 'ws:', 'wss:'],
      // Inline SVG icons carry style attributes; custom CSS may import remote fonts
      'style-src': ["'self'", "'unsafe-inline'", 'http:', 'https:'],
      'font-src': ["'self'", 'data:', 'http:', 'https:'],
      // Flame is commonly served over plain HTTP on a LAN
      'upgrade-insecure-requests': null,
    },
  },
  // TLS (and therefore HSTS) is the reverse proxy's responsibility
  strictTransportSecurity: false,
  xFrameOptions: frameAncestors.length ? false : { action: 'sameorigin' },
});

module.exports = securityHeaders;
