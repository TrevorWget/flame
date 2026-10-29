const { z } = require('zod');
const { emptyBody } = require('./fields');
const { SESSION_DURATIONS } = require('../utils/signToken');

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

const getProviders = { body: emptyBody };

const oidcLogin = {
  query: z.strictObject({ duration: z.enum(SESSION_DURATIONS).optional() }),
  body: emptyBody,
};

// Providers may add parameters of their own (iss, session_state, ...)
const oidcCallback = {
  query: z.record(z.string(), z.string().max(4096)),
  body: emptyBody,
};

const logout = { body: emptyBody };

const logoutAll = { body: emptyBody };

module.exports = {
  login,
  validateToken,
  getSession,
  getProviders,
  oidcLogin,
  oidcCallback,
  logout,
  logoutAll,
};
