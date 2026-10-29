const { z } = require('zod');
const { emptyBody } = require('./fields');

// Colors end up in CSS custom properties, so only hex colors are accepted
const color = z
  .string()
  .regex(
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
    'Must be a hex color, e.g. #1a1a1a'
  );

const theme = z.strictObject({
  // Used as a URL path segment by the client
  name: z
    .string()
    .trim()
    .min(1, 'Must not be empty')
    .max(100)
    .regex(/^[^/\\?#%]+$/, 'Name must not contain / \\ ? # or %'),
  colors: z.strictObject({
    background: color,
    primary: color,
    accent: color,
  }),
  isCustom: z.boolean(),
});

// Loose on purpose, so themes saved before validation can still be removed
const nameParam = z.strictObject({ name: z.string().min(1).max(255) });

const addTheme = { body: theme };

const updateTheme = { params: nameParam, body: theme };

const deleteTheme = { params: nameParam, body: emptyBody };

module.exports = { theme, addTheme, updateTheme, deleteTheme };
