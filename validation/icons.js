const { z } = require('zod');
const { FORMATS, VARIANTS } = require('../utils/selfhst');

const fetchIcon = {
  body: z.strictObject({
    url: z.string().trim().min(1, 'Must not be empty').max(2048),
  }),
};

const reference = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,99}$/, 'Must be a selfh.st icon reference');
const variant = z.enum(VARIANTS).default('standard');

const searchSelfhst = {
  query: z.strictObject({
    q: z.string().max(100).default(''),
    limit: z.coerce.number().int().min(1).max(200).default(48),
  }),
};

const suggestSelfhst = {
  query: z.strictObject({
    name: z.string().max(255),
  }),
};

const previewSelfhst = {
  params: z.strictObject({ reference }),
  query: z.strictObject({ variant }),
};

// 'auto' stores the light and dark versions too, to follow the theme
const storeSelfhst = {
  body: z.strictObject({
    reference,
    format: z.enum(FORMATS),
    variant: z.enum([...VARIANTS, 'auto']).default('standard'),
  }),
};

module.exports = {
  fetchIcon,
  searchSelfhst,
  suggestSelfhst,
  previewSelfhst,
  storeSelfhst,
};
