const VARIANT_FIELDS = ['iconOnDark', 'iconOnLight'];

const NO_VARIANTS = { iconOnDark: null, iconOnLight: null };

/**
 * A new `icon` replaces the theme versions of the old one, unless the same
 * request sets them too (uploads and API clients only send `icon`)
 */
const clearStaleVariants = (body, existing) => {
  if (!('icon' in body) || body.icon === existing.icon) return body;
  if (VARIANT_FIELDS.some((key) => key in body)) return body;

  return { ...body, ...NO_VARIANTS };
};

module.exports = { VARIANT_FIELDS, NO_VARIANTS, clearStaleVariants };
