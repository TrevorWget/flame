// Minimal OpenID Connect provider for tests and local development. Implements
// discovery, the authorization code flow with mandatory PKCE (S256), RS256 ID
// tokens, JWKS and userinfo. The authorize endpoint logs in `provider.user`
// without a login page.
//
// Standalone: node test/helpers/mockOidcProvider.js [port] [redirectUri]
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const s256 = (value) =>
  crypto.createHash('sha256').update(value).digest('base64url');

const createMockOidcProvider = ({
  clientId = 'flame',
  clientSecret = 'flame-client-secret',
  redirectUris = [],
} = {}) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'mock',
    use: 'sig',
    alg: 'RS256',
  };

  const codes = new Map();
  const accessTokens = new Map();

  const provider = {
    issuer: null,
    clientId,
    clientSecret,
    redirectUris,
    user: {
      sub: 'user-1',
      preferred_username: 'trevor',
      email: 'trevor@example.com',
      groups: ['admins'],
    },
    // Return groups from userinfo only, like providers that keep ID tokens small
    groupsInUserInfoOnly: false,
    // Answer the next authorization request with this OAuth error
    authorizeError: null,
    // Overrides merged into the next ID token, e.g. { nonce: 'other' }
    idTokenOverrides: null,
    tamperCodeChallenge: false,
    authorizeRequests: [],
    tokenRequests: [],
  };

  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get('/.well-known/openid-configuration', (req, res) => {
    res.json({
      issuer: provider.issuer,
      authorization_endpoint: `${provider.issuer}/authorize`,
      token_endpoint: `${provider.issuer}/token`,
      userinfo_endpoint: `${provider.issuer}/userinfo`,
      jwks_uri: `${provider.issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
      ],
    });
  });

  app.get('/jwks', (req, res) => res.json({ keys: [jwk] }));

  app.get('/authorize', (req, res) => {
    const q = req.query;
    provider.authorizeRequests.push(q);

    if (q.client_id !== provider.clientId) {
      return res.status(400).send('unknown client_id');
    }

    if (!provider.redirectUris.includes(q.redirect_uri)) {
      return res.status(400).send('redirect_uri is not registered');
    }

    const redirect = new URL(q.redirect_uri);
    redirect.searchParams.set('state', q.state);
    redirect.searchParams.set('iss', provider.issuer);

    if (provider.authorizeError) {
      redirect.searchParams.set('error', provider.authorizeError);
      provider.authorizeError = null;
      return res.redirect(302, redirect.href);
    }

    if (
      q.response_type !== 'code' ||
      q.code_challenge_method !== 'S256' ||
      !q.code_challenge
    ) {
      redirect.searchParams.set('error', 'invalid_request');
      return res.redirect(302, redirect.href);
    }

    const code = crypto.randomBytes(16).toString('hex');
    codes.set(code, {
      redirectUri: q.redirect_uri,
      challenge: provider.tamperCodeChallenge ? 'tampered' : q.code_challenge,
      nonce: q.nonce,
      scope: q.scope,
      user: { ...provider.user },
    });

    redirect.searchParams.set('code', code);
    res.redirect(302, redirect.href);
  });

  const clientAuthenticated = (req) => {
    const basic = req.get('authorization');

    if (basic?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(basic.slice(6), 'base64')
        .toString()
        .split(':')
        .map(decodeURIComponent);
      return id === provider.clientId && secret === provider.clientSecret;
    }

    return (
      req.body.client_id === provider.clientId &&
      req.body.client_secret === provider.clientSecret
    );
  };

  app.post('/token', (req, res) => {
    const body = req.body;
    provider.tokenRequests.push(body);

    if (!clientAuthenticated(req)) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const grant = codes.get(body.code);
    codes.delete(body.code);

    if (
      body.grant_type !== 'authorization_code' ||
      !grant ||
      grant.redirectUri !== body.redirect_uri ||
      !body.code_verifier ||
      s256(body.code_verifier) !== grant.challenge
    ) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    const { groups, ...profile } = grant.user;
    const accessToken = crypto.randomBytes(16).toString('hex');
    accessTokens.set(accessToken, grant.user);

    const overrides = provider.idTokenOverrides;
    provider.idTokenOverrides = null;

    const idToken = jwt.sign(
      {
        ...profile,
        ...(provider.groupsInUserInfoOnly ? {} : { groups }),
        iss: provider.issuer,
        aud: provider.clientId,
        nonce: grant.nonce,
        ...overrides,
      },
      privateKey,
      { algorithm: 'RS256', keyid: 'mock', expiresIn: '5m' }
    );

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken,
    });
  });

  app.get('/userinfo', (req, res) => {
    const user = accessTokens.get(
      (req.get('authorization') || '').replace(/^Bearer /, '')
    );

    if (!user) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    res.json(user);
  });

  provider.listen = (port = 0) =>
    new Promise((resolve) => {
      const server = app.listen(port, '127.0.0.1', () => {
        provider.issuer = `http://127.0.0.1:${server.address().port}`;
        provider.close = () => new Promise((done) => server.close(done));
        resolve(provider);
      });
    });

  return provider;
};

module.exports = { createMockOidcProvider };

if (require.main === module) {
  const port = Number(process.argv[2] || 5293);
  const redirectUri =
    process.argv[3] || 'http://localhost:5213/api/auth/oidc/callback';

  createMockOidcProvider({ redirectUris: [redirectUri] })
    .listen(port)
    .then((provider) => {
      console.log(`Mock OIDC provider: ${provider.issuer}`);
      console.log(`client_id=${provider.clientId}`);
      console.log(`client_secret=${provider.clientSecret}`);
      console.log(`redirect_uri=${redirectUri}`);
    });
}
