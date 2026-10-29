const { z } = require('zod');
const {
  MAX_URL_LENGTH,
  id,
  idParam,
  visibility,
  flag,
  name,
  url,
  icon,
  reorderList,
  emptyBody,
  writableFields,
} = require('./fields');
const { isHttpUrl } = require('../utils/urlSchemes');

const READ_ONLY = ['id', 'createdAt', 'updatedAt', 'orderId', 'source'];

const description = z.string().trim().max(1000);

// Same inputs as visibility (JSON booleans, multipart "1"/"0"), stored as a boolean
const statusCheck = visibility.transform(Boolean);

// Empty means "check the app URL"
const statusUrl = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH)
  .nullable()
  .refine(
    (value) => !value || isHttpUrl(value),
    'Status check URL must be an http:// or https:// URL'
  )
  .transform((value) => value || null);

// Optional, so an empty string clears it
const externalUrl = z.literal('').or(url);

const preferredUrl = z.enum(['internal', 'external']);

const createApp = {
  body: writableFields(
    {
      name,
      url,
      externalUrl: externalUrl.optional(),
      preferredUrl: preferredUrl.optional(),
      categoryId: id,
      icon: icon.optional(),
      description: description.optional(),
      isPublic: visibility.optional(),
      statusCheck: statusCheck.optional(),
      statusUrl: statusUrl.optional(),
    },
    // New apps are pinned according to the pinAppsByDefault setting
    [...READ_ONLY, 'isPinned']
  ),
};

const updateApp = {
  params: idParam,
  body: writableFields(
    {
      name: name.optional(),
      url: url.optional(),
      externalUrl: externalUrl.optional(),
      preferredUrl: preferredUrl.optional(),
      categoryId: id.optional(),
      icon: icon.optional(),
      description: description.optional(),
      isPublic: visibility.optional(),
      isPinned: flag.optional(),
      statusCheck: statusCheck.optional(),
      statusUrl: statusUrl.optional(),
    },
    READ_ONLY
  ),
};

const deleteApp = { params: idParam, body: emptyBody };

const reorderApps = { body: reorderList('apps') };

module.exports = { createApp, updateApp, deleteApp, reorderApps };
