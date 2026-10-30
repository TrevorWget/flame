const { z } = require('zod');
const { SETTINGS, updateCSS } = require('../../validation/config');
const { theme } = require('../../validation/themes');
const { queryFields } = require('../../validation/queries');
const { SECRET_KEYS } = require('../sanitizeConfig');
const { isAllowedUrl, isHttpUrl } = require('../urlSchemes');

const FORMAT = 'flame-backup';

// Bump when data.json changes shape, and add an upgrade from the previous version
const SCHEMA_VERSION = 1;

// UPGRADES[n] turns data.json of schema version n into version n + 1
const UPGRADES = {};

const MAX_ITEMS = 10000;
const MAX_URL_LENGTH = 2048;

const id = z.number().int().positive();
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const name = z.string().min(1).max(255);
const url = z.string().min(1).max(MAX_URL_LENGTH);
const icon = z.string().max(MAX_URL_LENGTH);
// Missing from backups made before icons could follow the theme
const iconVariant = icon
  .nullable()
  .transform((value) => value || null)
  .default(null);
const orderId = z.number().int().nullable().default(null);
const isPinned = z.boolean().nullable().default(false);
const isPublic = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .nullable()
  .transform((value) => (value === null ? null : Number(value)))
  .default(1);

// Older or hand-written backups may leave these out; restore fills in the time of the restore
const timestamps = {
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
};

// Every column of these tables must be listed here, or backups lose it
// (test/backup.test.js compares them with the models)
const category = z.object({
  id,
  name,
  type: z.enum(['apps', 'bookmarks']),
  isPinned,
  orderId,
  isPublic,
  ...timestamps,
});

const app = z.object({
  id,
  name,
  url,
  categoryId: id,
  icon: icon.default('cancel'),
  iconOnDark: iconVariant,
  iconOnLight: iconVariant,
  isPinned,
  orderId,
  isPublic,
  description: z.string().max(1000).default(''),
  source: z.string().max(50).nullable().default(null),
  externalUrl: z.string().max(MAX_URL_LENGTH).default(''),
  preferredUrl: z.enum(['internal', 'external']).default('internal'),
  statusCheck: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .transform(Boolean)
    .default(true),
  statusUrl: z
    .string()
    .max(MAX_URL_LENGTH)
    .nullable()
    .transform((value) => value || null)
    .default(null),
  ...timestamps,
});

const bookmark = z.object({
  id,
  name,
  url,
  categoryId: id,
  icon: icon.default(''),
  iconOnDark: iconVariant,
  iconOnLight: iconVariant,
  isPublic,
  orderId,
  ...timestamps,
});

// Secrets are never exported, and a backup can't set them either
const SETTINGS_SHAPE = Object.fromEntries(
  Object.entries(SETTINGS).filter(([key]) => !SECRET_KEYS.includes(key))
);
const SETTINGS_KEYS = Object.keys(SETTINGS_SHAPE);

const query = z.object({ ...queryFields, template: url });

const list = (schema) => z.array(schema).max(MAX_ITEMS);

const checkUnique = (ctx, items, key, path) => {
  const seen = new Set();

  items.forEach((item, i) => {
    if (seen.has(item[key])) {
      ctx.addIssue({
        code: 'custom',
        path: [path, i, key],
        message: `Duplicate ${key} ${item[key]}`,
      });
    }

    seen.add(item[key]);
  });
};

/**
 * Schema of data.json. Links are checked against the URL schemes allowed by
 * the restored settings, or the current ones if the backup has none.
 */
const dataSchema = (currentExtraUrlSchemes) =>
  z
    .object({
      categories: list(category),
      apps: list(app),
      bookmarks: list(bookmark),
      // A missing section keeps the current settings, themes or search providers
      settings: z.object(SETTINGS_SHAPE).partial().optional(),
      themes: list(theme).optional(),
      queries: list(query).optional(),
    })
    .superRefine((data, ctx) => {
      checkUnique(ctx, data.categories, 'id', 'categories');
      checkUnique(ctx, data.apps, 'id', 'apps');
      checkUnique(ctx, data.bookmarks, 'id', 'bookmarks');
      checkUnique(ctx, data.themes || [], 'name', 'themes');
      checkUnique(ctx, data.queries || [], 'prefix', 'queries');

      const categoryIds = new Set(data.categories.map((c) => c.id));
      const extraUrlSchemes =
        data.settings?.extraUrlSchemes ?? currentExtraUrlSchemes;

      for (const [path, items, key] of [
        ['apps', data.apps, 'url'],
        ['bookmarks', data.bookmarks, 'url'],
        ['queries', data.queries || [], 'template'],
      ]) {
        items.forEach((item, i) => {
          if (!isAllowedUrl(item[key], extraUrlSchemes)) {
            ctx.addIssue({
              code: 'custom',
              path: [path, i, key],
              message: 'URL is invalid or its scheme is not allowed',
            });
          }

          if ('categoryId' in item && !categoryIds.has(item.categoryId)) {
            ctx.addIssue({
              code: 'custom',
              path: [path, i, 'categoryId'],
              message: `No category with id ${item.categoryId}`,
            });
          }
        });
      }

      data.apps.forEach((app, i) => {
        if (app.externalUrl && !isAllowedUrl(app.externalUrl, extraUrlSchemes)) {
          ctx.addIssue({
            code: 'custom',
            path: ['apps', i, 'externalUrl'],
            message: 'URL is invalid or its scheme is not allowed',
          });
        }

        if (app.statusUrl && !isHttpUrl(app.statusUrl)) {
          ctx.addIssue({
            code: 'custom',
            path: ['apps', i, 'statusUrl'],
            message: 'Status check URL must be an http:// or https:// URL',
          });
        }
      });
    });

const manifestSchema = z.object({
  format: z.literal(FORMAT, { error: 'Not a Flame backup' }),
  schemaVersion: z.number().int().positive(),
  flameVersion: z.string().max(50).optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

const cssSchema = updateCSS.body.shape.styles;

module.exports = {
  FORMAT,
  SCHEMA_VERSION,
  UPGRADES,
  SETTINGS_KEYS,
  dataSchema,
  manifestSchema,
  cssSchema,
};
