const { z } = require('zod');

const fetchIcon = {
  body: z.strictObject({
    url: z.string().trim().min(1, 'Must not be empty').max(2048),
  }),
};

module.exports = { fetchIcon };
