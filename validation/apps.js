const { z } = require('zod');
const {
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

const READ_ONLY = ['id', 'createdAt', 'updatedAt', 'orderId', 'source'];

const description = z.string().trim().max(1000);

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
    },
    READ_ONLY
  ),
};

const deleteApp = { params: idParam, body: emptyBody };

const reorderApps = { body: reorderList('apps') };

module.exports = { createApp, updateApp, deleteApp, reorderApps };
