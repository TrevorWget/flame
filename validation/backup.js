const { z } = require('zod');
const { emptyBody } = require('./fields');

const downloadFile = {
  params: z.strictObject({ name: z.string().min(1).max(100) }),
  query: emptyBody,
};

module.exports = { downloadFile };
