const { z } = require('zod');
const { emptyBody } = require('./fields');

// Shape only; which durations are allowed and the password check stay in the
// login controller
const login = {
  body: z.strictObject({
    password: z.string().max(1024),
    duration: z.string().max(16),
  }),
};

const validateToken = {
  body: z.strictObject({ token: z.string().max(4096) }),
};

const getSession = { body: emptyBody };

const logout = { body: emptyBody };

const logoutAll = { body: emptyBody };

module.exports = { login, validateToken, getSession, logout, logoutAll };
