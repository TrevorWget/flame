const { z } = require('zod');
const loadConfig = require('../utils/loadConfig');
const { isAllowedUrl } = require('../utils/urlSchemes');

const MAX_URL_LENGTH = 2048;

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Multipart fields arrive as strings, JSON bodies as numbers
const id = z.union(
  [
    z.number().int().positive(),
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().positive()),
  ],
  { error: 'Expected a positive integer' }
);

const idParam = z.strictObject({ id });

// Stored as 0/1 integers. The JSON forms send booleans, multipart sends "1"/"0".
const visibility = z
  .union(
    [
      z.boolean(),
      z.literal(0),
      z.literal(1),
      z.enum(['0', '1', 'true', 'false']),
    ],
    { error: 'Expected true/false or 1/0' }
  )
  .transform((value) =>
    value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
  );

const flag = z
  .union([z.boolean(), z.literal(0), z.literal(1)], {
    error: 'Expected true/false or 1/0',
  })
  .transform(Boolean);

const name = z.string().trim().min(1, 'Must not be empty').max(255);

// URL fields go through the same scheme allow-list as the client renders with
const url = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine(
    async (value) => isAllowedUrl(value, (await loadConfig()).extraUrlSchemes),
    'URL is invalid or its scheme is not allowed'
  );

// MDI icon name, remote icon URL or uploaded file name
const icon = z.string().trim().max(MAX_URL_LENGTH);

// Icon shown instead of `icon` on dark or light themes; empty means "use `icon`"
const iconVariant = icon.nullable().transform((value) => value || null);

const reorderList = (key) =>
  z.strictObject({
    [key]: z
      .array(
        z.strictObject({
          id: z.number().int().positive(),
          orderId: z.number().int().nonnegative(),
        })
      )
      .max(10000),
  });

const emptyBody = z.strictObject({});

/**
 * Strict object schema that silently drops `ignoredKeys`. The edit forms send
 * back the whole object they loaded (id, timestamps, nested items, ...), so
 * those keys are accepted but can never be written.
 */
const writableFields = (shape, ignoredKeys = []) =>
  z.preprocess((value) => {
    if (!isPlainObject(value)) return value;

    const writable = { ...value };

    for (const key of ignoredKeys) {
      delete writable[key];
    }

    return writable;
  }, z.strictObject(shape));

module.exports = {
  MAX_URL_LENGTH,
  id,
  idParam,
  visibility,
  flag,
  name,
  url,
  icon,
  iconVariant,
  reorderList,
  emptyBody,
  writableFields,
  isPlainObject,
};
