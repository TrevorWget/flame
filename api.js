const { join } = require('path');
const express = require('express');
const { errorHandler } = require('./middleware');
const securityHeaders = require('./middleware/securityHeaders');
const { ICON_EXTENSION_REGEX } = require('./utils/icons');
const { parseTrustProxy } = require('./utils/trustProxy');

const api = express();

// Behind a reverse proxy, lets req.ip (used by the login rate limit) resolve to
// the real client. Forward-auth headers are only accepted from these proxies.
if (process.env.TRUST_PROXY) {
  api.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
}

api.use(securityHeaders);

// Static files
api.use(express.static(join(__dirname, 'public')));
api.use(
  '/uploads',
  express.static(join(__dirname, 'data/uploads'), {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
      );

      if (!ICON_EXTENSION_REGEX.test(path)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  }),
  (req, res) => res.sendStatus(404)
);
api.get(/^\/(?!api)/, (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Body parser
api.use(express.json());

// Link controllers with routes
api.use('/api/apps', require('./routes/apps'));
api.use('/api/config', require('./routes/config'));
api.use('/api/weather', require('./routes/weather'));
api.use('/api/categories', require('./routes/category'));
api.use('/api/bookmarks', require('./routes/bookmark'));
api.use('/api/queries', require('./routes/queries'));
api.use('/api/auth', require('./routes/auth'));
api.use('/api/themes', require('./routes/themes'));
api.use('/api/icons', require('./routes/icons'));

// Custom error handler
api.use(errorHandler);

module.exports = api;
