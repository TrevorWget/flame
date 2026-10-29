const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const SVG_NS = 'http://www.w3.org/2000/svg';

// Extensions /uploads serves inline; anything else is forced to download
const ICON_EXTENSION_REGEX = /\.(png|jpe?g|ico|webp|svg)$/i;

const SAFE_HREF_REGEX = /^#|^data:image\/(png|jpe?g|gif|webp)[;,]/i;
const SAFE_USE_HREF_REGEX = /^#/;

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, i) => buffer[offset + i] === byte);

const ascii = (str) => [...str].map((char) => char.charCodeAt(0));

const detectRasterType = (buffer) => {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpg';
  }

  if (startsWith(buffer, [0x00, 0x00, 0x01, 0x00]) && buffer.length > 6) {
    return 'ico';
  }

  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) {
    return 'webp';
  }

  return null;
};

/**
 * Parse buffer as an SVG document and strip anything executable or external.
 * Returns the sanitized SVG, or null if the buffer is not a well-formed SVG.
 */
const sanitizeSvg = (buffer) => {
  let text;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }

  let dom;

  try {
    dom = new JSDOM(text, { contentType: 'image/svg+xml' });
  } catch {
    return null;
  }

  const root = dom.window.document.documentElement;

  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    return null;
  }

  const purify = createDOMPurify(dom.window);

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (typeof node.getAttribute !== 'function') return;

    const allowed = node.localName === 'use' ? SAFE_USE_HREF_REGEX : SAFE_HREF_REGEX;

    for (const name of ['href', 'xlink:href']) {
      const value = node.getAttribute(name);

      if (value !== null && !allowed.test(value.trim())) {
        node.removeAttribute(name);
      }
    }
  });

  purify.sanitize(root, {
    IN_PLACE: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
  });

  return Buffer.from(new dom.window.XMLSerializer().serializeToString(root));
};

/**
 * Identify an uploaded icon by its content (never the client-supplied name or MIME).
 * Returns { ext, data } with data safe to store, or null if the type is not allowed.
 */
const processIcon = (buffer) => {
  const rasterType = detectRasterType(buffer);

  if (rasterType) {
    return { ext: rasterType, data: buffer };
  }

  const svg = sanitizeSvg(buffer);

  return svg ? { ext: 'svg', data: svg } : null;
};

module.exports = {
  ICON_EXTENSION_REGEX,
  processIcon,
  sanitizeSvg,
};
