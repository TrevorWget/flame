// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createMockOidcProvider } = require('./helpers/mockOidcProvider');

const PASSWORD = 'ci-test-password-8f2d';
const REDIRECT_URI = 'http://flame.test/api/auth/oidc/callback';

process.env.NODE_ENV = 'test';
process.env.PASSWORD = PASSWORD;
process.env.SECRET = crypto.randomBytes(32).toString('hex');

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-sso-test-'));

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify(require('../utils/init/initialConfig.json'))
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const api = require('../api');
const { getProxyAuthProblem } = require('../utils/proxyAuth');

const provider = createMockOidcProvider({ redirectUris: [REDIRECT_URI] });

test.before(() => provider.listen());

test.after(async () => {
  await provider.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const withEnv = async (overrides, fn) => {
  const saved = {};

  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];

    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withTrustProxy = async (value, fn) => {
  const saved = api.get('trust proxy');
  api.set('trust proxy', value);

  try {
    return await fn();
  } finally {
    api.set('trust proxy', saved);
  }
};

const CSRF = { 'X-Flame-CSRF': '1' };

const cookieFrom = (res, name) => {
  const cookie = (res.headers['set-cookie'] || []).find((c) =>
    c.startsWith(`${name}=`)
  );

  return (
    cookie && {
      header: cookie,
      value: cookie.split(';')[0].slice(name.length + 1),
    }
  );
};

const session = (cookie) => {
  const req = request(api).get('/api/auth');

  return cookie ? req.set('Cookie', `flame_token=${cookie}`) : req;
};

const getAdminConfig = (token) =>
  request(api).get('/api/config/admin').set('Cookie', `flame_token=${token}`);

test.describe('OIDC', () => {
  const oidcEnv = () => ({
    OIDC_DISCOVERY_URL: `${provider.issuer}/.well-known/openid-configuration`,
    OIDC_CLIENT_ID: provider.clientId,
    OIDC_CLIENT_SECRET: provider.clientSecret,
    OIDC_REDIRECT_URI: REDIRECT_URI,
    OIDC_ALLOW_INSECURE_HTTP: 'true',
    OIDC_PROVIDER_NAME: 'Authentik',
  });

  const withOidc = (overrides, fn) =>
    withEnv({ ...oidcEnv(), ...overrides }, fn);

  const startLogin = async (query = '') => {
    const res = await request(api).get(`/api/auth/oidc/login${query}`);
    assert.strictEqual(res.status, 303);

    return {
      authorizeUrl: new URL(res.headers.location),
      stateCookie: cookieFrom(res, 'flame_oidc'),
    };
  };

  // Follows the provider's redirect back to Flame's callback
  const authorize = async (authorizeUrl) => {
    const res = await fetch(authorizeUrl, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);

    const callback = new URL(res.headers.get('location'));
    assert.strictEqual(callback.origin + callback.pathname, REDIRECT_URI);

    return callback.pathname + callback.search;
  };

  const callback = (path, stateCookie) => {
    const req = request(api).get(path);

    return stateCookie
      ? req.set('Cookie', `flame_oidc=${stateCookie.value}`)
      : req;
  };

  const login = async (query) => {
    const { authorizeUrl, stateCookie } = await startLogin(query);
    const res = await callback(await authorize(authorizeUrl), stateCookie);

    return { res, token: cookieFrom(res, 'flame_token')?.value };
  };

  const assertRejected = (res, code) => {
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, `/settings/app?ssoError=${code}`);
    assert.strictEqual(cookieFrom(res, 'flame_token'), undefined);
  };

  test('is off by default', async () => {
    const providers = await request(api).get('/api/auth/providers');
    assert.deepStrictEqual(providers.body.data, { password: true, oidc: null });

    assert.strictEqual(
      (await request(api).get('/api/auth/oidc/login')).status,
      404
    );
    assert.strictEqual(
      (await request(api).get('/api/auth/oidc/callback?code=x&state=y')).status,
      404
    );
  });

  test('is listed as a login provider when configured', async () => {
    await withOidc({}, async () => {
      const res = await request(api).get('/api/auth/providers');
      assert.deepStrictEqual(res.body.data, {
        password: true,
        oidc: { name: 'Authentik' },
      });
    });
  });

  test('misconfigured settings disable it', async () => {
    for (const overrides of [
      { OIDC_CLIENT_ID: undefined },
      { OIDC_ALLOW_INSECURE_HTTP: undefined },
      { OIDC_REDIRECT_URI: 'http://flame.test/elsewhere' },
      { OIDC_SCOPES: 'profile email' },
    ]) {
      await withOidc(overrides, async () => {
        const res = await request(api).get('/api/auth/providers');
        assert.strictEqual(res.body.data.oidc, null, JSON.stringify(overrides));
        assert.strictEqual(
          (await request(api).get('/api/auth/oidc/login')).status,
          404
        );
      });
    }
  });

  test('login redirects to the provider with PKCE, state and nonce', async () => {
    await withOidc({}, async () => {
      const { authorizeUrl, stateCookie } = await startLogin();
      const params = authorizeUrl.searchParams;

      assert.strictEqual(authorizeUrl.origin, provider.issuer);
      assert.strictEqual(params.get('response_type'), 'code');
      assert.strictEqual(params.get('client_id'), provider.clientId);
      assert.strictEqual(params.get('redirect_uri'), REDIRECT_URI);
      assert.strictEqual(params.get('scope'), 'openid profile email');
      assert.strictEqual(params.get('code_challenge_method'), 'S256');
      assert.match(params.get('code_challenge'), /^[\w-]{43}$/);
      assert.ok(params.get('state'));
      assert.ok(params.get('nonce'));

      assert.match(stateCookie.header, /; HttpOnly/);
      assert.match(stateCookie.header, /; SameSite=Lax/);
      assert.match(stateCookie.header, /; Path=\/api\/auth\/oidc/);
      // The PKCE verifier is encrypted, never readable in the cookie
      assert.ok(!stateCookie.value.includes(params.get('state')));
    });
  });

  test('a successful login starts a normal cookie session', async () => {
    await withOidc({}, async () => {
      const { res, token } = await login();

      assert.strictEqual(res.headers.location, '/settings/app');
      assert.ok(token);

      const tokenCookie = cookieFrom(res, 'flame_token').header;
      assert.match(tokenCookie, /; HttpOnly/);
      assert.match(tokenCookie, /; SameSite=Strict/);
      assert.match(cookieFrom(res, 'flame_oidc').header, /^flame_oidc=;/);

      const tokenRequest = provider.tokenRequests.at(-1);
      assert.ok(tokenRequest.code_verifier);

      const { data } = (await session(token)).body;
      assert.strictEqual(data.isAuthenticated, true);
      assert.strictEqual(data.method, 'oidc');
      assert.strictEqual(data.user, 'trevor');
      // 14 days unless the login form picked another duration
      assert.ok(Math.abs(data.expiresAt - (Date.now() + 14 * 86400e3)) < 10e3);

      assert.strictEqual((await getAdminConfig(token)).status, 200);

      const mutation = () =>
        request(api)
          .put('/api/config')
          .set('Cookie', `flame_token=${token}`)
          .send({ customTitle: 'SSO' });
      assert.strictEqual((await mutation()).status, 403);
      assert.strictEqual((await mutation().set(CSRF)).status, 200);
    });
  });

  test('the session duration from the login form is used', async () => {
    await withOidc({}, async () => {
      const { token } = await login('?duration=1h');
      assert.ok(
        Math.abs(jwt.decode(token).exp * 1000 - (Date.now() + 3600e3)) < 10e3
      );

      assert.strictEqual(
        (await request(api).get('/api/auth/oidc/login?duration=100y')).status,
        400
      );
    });
  });

  test("a callback without this browser's state cookie is rejected", async () => {
    await withOidc({}, async () => {
      const { authorizeUrl } = await startLogin();
      const path = await authorize(authorizeUrl);

      assertRejected(await callback(path), 'expired');
      assertRejected(
        await callback(path, { value: 'forged-or-from-another-secret' }),
        'expired'
      );
    });
  });

  test('a callback for another login (state mismatch) is rejected', async () => {
    await withOidc({}, async () => {
      const victim = await startLogin();
      const attacker = await startLogin();
      const attackerCallback = await authorize(attacker.authorizeUrl);

      assertRejected(
        await callback(attackerCallback, victim.stateCookie),
        'failed'
      );
    });
  });

  test('a code cannot be redeemed twice', async () => {
    await withOidc({}, async () => {
      const { authorizeUrl, stateCookie } = await startLogin();
      const path = await authorize(authorizeUrl);

      assert.ok(cookieFrom(await callback(path, stateCookie), 'flame_token'));
      assertRejected(await callback(path, stateCookie), 'failed');
    });
  });

  test('ID tokens with the wrong nonce, audience or issuer are rejected', async () => {
    await withOidc({}, async () => {
      for (const overrides of [
        { nonce: 'replayed' },
        { aud: 'another-client' },
        { iss: 'http://evil.example' },
      ]) {
        const { authorizeUrl, stateCookie } = await startLogin();
        const path = await authorize(authorizeUrl);
        provider.idTokenOverrides = overrides;

        assertRejected(await callback(path, stateCookie), 'failed');
      }
    });
  });

  test('the PKCE verifier must match the challenge', async () => {
    await withOidc({}, async () => {
      provider.tamperCodeChallenge = true;

      try {
        const { res } = await login();
        assertRejected(res, 'failed');
      } finally {
        provider.tamperCodeChallenge = false;
      }
    });
  });

  test('an error from the provider is reported', async () => {
    await withOidc({}, async () => {
      provider.authorizeError = 'access_denied';
      assertRejected((await login()).res, 'denied');
    });
  });

  test('OIDC_ALLOWED_GROUPS restricts who can log in', async () => {
    await withOidc(
      { OIDC_ALLOWED_GROUPS: 'flame-admins, admins' },
      async () => {
        assert.ok((await login()).token);

        provider.groupsInUserInfoOnly = true;
        try {
          assert.ok((await login()).token, 'groups from userinfo');
        } finally {
          provider.groupsInUserInfoOnly = false;
        }
      }
    );

    await withOidc({ OIDC_ALLOWED_GROUPS: 'flame-admins' }, async () => {
      assertRejected((await login()).res, 'forbidden');

      const saved = provider.user;
      provider.user = { sub: 'user-2', preferred_username: 'nogroups' };
      try {
        assertRejected((await login()).res, 'forbidden');
      } finally {
        provider.user = saved;
      }
    });
  });

  test('OIDC sessions end when OIDC is turned off or its settings change', async () => {
    const token = await withOidc({}, async () => (await login()).token);

    await withOidc({}, async () => {
      assert.strictEqual((await getAdminConfig(token)).status, 200);
    });
    assert.strictEqual((await getAdminConfig(token)).status, 401);

    await withOidc({ OIDC_ALLOWED_GROUPS: 'admins' }, async () => {
      assert.strictEqual((await getAdminConfig(token)).status, 401);
    });
    await withOidc({ OIDC_CLIENT_ID: 'another-client' }, async () => {
      assert.strictEqual((await getAdminConfig(token)).status, 401);
    });
  });

  test('works without a PASSWORD; password login stays disabled', async () => {
    await withOidc({ PASSWORD: undefined }, async () => {
      const providers = await request(api).get('/api/auth/providers');
      assert.deepStrictEqual(providers.body.data, {
        password: false,
        oidc: { name: 'Authentik' },
      });

      const { token } = await login();
      assert.strictEqual((await getAdminConfig(token)).status, 200);

      const passwordLogin = await request(api)
        .post('/api/auth')
        .set(CSRF)
        .send({ password: '', duration: '1h' });
      assert.strictEqual(passwordLogin.status, 503);
    });
  });

  test('password sessions are unaffected by OIDC', async () => {
    const res = await request(api)
      .post('/api/auth')
      .set(CSRF)
      .send({ password: PASSWORD, duration: '1h' });
    const token = cookieFrom(res, 'flame_token').value;

    assert.strictEqual(res.body.data.method, 'password');
    assert.strictEqual(res.body.data.user, null);

    await withOidc({}, async () => {
      assert.strictEqual((await getAdminConfig(token)).status, 200);
    });
    assert.strictEqual((await getAdminConfig(token)).status, 200);
  });

  test('an unreachable provider is reported and retried on the next login', async () => {
    await withOidc(
      {
        OIDC_DISCOVERY_URL:
          'http://127.0.0.1:9/.well-known/openid-configuration',
      },
      async () => {
        const res = await request(api).get('/api/auth/oidc/login');
        assert.strictEqual(res.status, 303);
        assert.strictEqual(
          res.headers.location,
          '/settings/app?ssoError=unavailable'
        );
      }
    );

    await withOidc({}, async () => {
      assert.ok((await login()).token);
    });
  });
});

test.describe('forward-auth header', () => {
  const HEADER = 'X-authentik-username';

  const withProxyAuth = (fn, env = {}) =>
    withEnv({ AUTH_PROXY_HEADER: HEADER, ...env }, fn);

  const asProxy = (req, user = 'trevor') => req.set(HEADER, user);

  test('is ignored unless AUTH_PROXY_HEADER is set', async () => {
    await withTrustProxy('loopback', async () => {
      const res = await asProxy(request(api).get('/api/config/admin'));
      assert.strictEqual(res.status, 401);
    });
  });

  test('authenticates requests from a trusted proxy', async () => {
    await withProxyAuth(
      () =>
        withTrustProxy('loopback', async () => {
          assert.strictEqual(
            (await asProxy(request(api).get('/api/config/admin'))).status,
            200
          );

          const { data } = (await asProxy(session())).body;
          assert.deepStrictEqual(data, {
            isAuthenticated: true,
            expiresAt: null,
            method: 'proxy',
            user: 'trevor',
            logoutUrl:
              'https://auth.example.com/outpost.goauthentik.io/sign_out',
          });

          // Header names are case-insensitive
          const lower = await request(api)
            .get('/api/config/admin')
            .set(HEADER.toLowerCase(), 'trevor');
          assert.strictEqual(lower.status, 200);
        }),
      {
        AUTH_PROXY_LOGOUT_URL:
          'https://auth.example.com/outpost.goauthentik.io/sign_out',
      }
    );
  });

  test('is rejected from sources outside TRUST_PROXY (header spoofing)', async () => {
    await withProxyAuth(() =>
      withTrustProxy('10.0.0.0/8, 172.16.0.0/12', async () => {
        const direct = await asProxy(request(api).get('/api/config/admin'));
        assert.strictEqual(direct.status, 401);

        // Claiming to come through a trusted proxy doesn't help
        const forwarded = await asProxy(
          request(api)
            .get('/api/config/admin')
            .set('X-Forwarded-For', '10.0.0.5')
        );
        assert.strictEqual(forwarded.status, 401);

        const { data } = (await asProxy(session())).body;
        assert.strictEqual(data.isAuthenticated, false);

        const mutation = await asProxy(request(api).put('/api/config'))
          .set(CSRF)
          .send({ customTitle: 'spoofed' });
        assert.strictEqual(mutation.status, 401);
      })
    );
  });

  test('is rejected when TRUST_PROXY is unset, true or a hop count', async () => {
    for (const trustProxy of [false, true, 1, 2]) {
      await withProxyAuth(() =>
        withTrustProxy(trustProxy, async () => {
          const res = await asProxy(request(api).get('/api/config/admin'));
          assert.strictEqual(res.status, 401, `trust proxy ${trustProxy}`);
        })
      );
    }

    assert.ok(getProxyAuthProblem(undefined));
    assert.ok(getProxyAuthProblem(true));
    assert.ok(getProxyAuthProblem(1));
    assert.strictEqual(getProxyAuthProblem('172.18.0.0/16'), null);
  });

  test('empty and oversized user names are rejected', async () => {
    await withProxyAuth(() =>
      withTrustProxy('loopback', async () => {
        for (const user of ['', '   ', 'x'.repeat(257)]) {
          const res = await asProxy(
            request(api).get('/api/config/admin'),
            user
          );
          assert.strictEqual(res.status, 401, JSON.stringify(user));
        }
      })
    );
  });

  test('mutations still need the CSRF header', async () => {
    await withProxyAuth(() =>
      withTrustProxy('loopback', async () => {
        const mutation = () =>
          asProxy(request(api).put('/api/config')).send({
            customTitle: 'Proxy',
          });

        const rejected = await mutation();
        assert.strictEqual(rejected.status, 403);
        assert.match(rejected.body.error, /X-Flame-CSRF/);

        assert.strictEqual((await mutation().set(CSRF)).status, 200);
      })
    );
  });

  test('a valid session cookie takes precedence', async () => {
    const res = await request(api)
      .post('/api/auth')
      .set(CSRF)
      .send({ password: PASSWORD, duration: '1h' });
    const token = cookieFrom(res, 'flame_token').value;

    await withProxyAuth(() =>
      withTrustProxy('loopback', async () => {
        const { data } = (await asProxy(session(token))).body;
        assert.strictEqual(data.method, 'password');
      })
    );
  });

  test('only http(s) or same-site logout URLs are passed to the client', async () => {
    for (const [url, expected] of [
      ['javascript:alert(1)', null],
      ['//evil.example/logout', null],
      ['/outpost.goauthentik.io/sign_out', '/outpost.goauthentik.io/sign_out'],
    ]) {
      await withProxyAuth(
        () =>
          withTrustProxy('loopback', async () => {
            const { data } = (await asProxy(session())).body;
            assert.strictEqual(data.logoutUrl, expected, url);
          }),
        { AUTH_PROXY_LOGOUT_URL: url }
      );
    }
  });
});
