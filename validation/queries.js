const { z } = require('zod');
const { url, emptyBody } = require('./fields');

const queryFields = {
  name: z.string().trim().min(1, 'Must not be empty').max(100),
  // The search bar only matches "/<letters> <query>"
  prefix: z
    .string()
    .trim()
    .regex(/^[a-z]+$/i, 'Prefix must only contain letters')
    .max(20),
};

const query = z.strictObject({ ...queryFields, template: url });

// Loose on purpose, so queries saved before validation can still be removed
const prefixParam = z.strictObject({ prefix: z.string().min(1).max(255) });

const addQuery = { body: query };

const updateQuery = { params: prefixParam, body: query };

const deleteQuery = { params: prefixParam, body: emptyBody };

module.exports = { queryFields, addQuery, updateQuery, deleteQuery };
