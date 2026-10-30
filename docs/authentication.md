# Authentication

Flame has one admin login. Guests can see the dashboard, but only public apps, bookmarks and categories. Changing anything requires being logged in.

There are three ways to log in, and they can be combined:

| Method | Enable with | Use it when |
| --- | --- | --- |
| [Password](#password) | `PASSWORD` | Always available unless `PASSWORD` is unset |
| [Forward-auth header](#forward-auth-header) | `AUTH_PROXY_HEADER` + `TRUST_PROXY` | Your reverse proxy already authenticates every request (Authentik, Authelia, ...) |
| [OIDC](#oidc) | `OIDC_DISCOVERY_URL` + `OIDC_CLIENT_ID` | You want a "Log in with ..." button without putting Flame behind forward auth |

Every variable can also be read from a file with the `_FILE` suffix or from `/run/secrets`, see [Secrets](installation.md#secrets).

## Password

- `PASSWORD` is the admin password. If it is unset or one of the old example values (`flame_password`, `change_me`, `my_custom_secret_password_123`), password login is disabled and an error is logged at startup. The dashboard still works read-only.
- If forward-auth or OIDC is configured, `PASSWORD` can be left unset; password login is then disabled and only SSO works.
- Failed logins are limited to 10 per 15 minutes per client IP. Behind a reverse proxy, set `TRUST_PROXY` so the real client IP is used.
- The login form offers sessions of 1 hour, 1 day, 14 days, 30 days or 1 year.
- Changing `PASSWORD` ends every password session.

## Sessions and cookies

- The session is a JWT in the `flame_token` cookie: `HttpOnly`, `SameSite=Strict`, and `Secure` when the request came over HTTPS. Behind a TLS-terminating proxy, `TRUST_PROXY` is what lets Flame see that, so set it.
- Tokens are signed with `SECRET`. Leave it unset to have a random secret generated and stored in `data/.secret`. Flame refuses to start if `SECRET` is the value that was committed to this repository before v2.4.0, and warns if it is shorter than 32 bytes.
- **Settings > App > Log out all sessions** invalidates every issued token, e.g. after losing a device.
- Browsers send cookies to every port of a host, so other web apps on the same hostname (e.g. `http://server:8080` next to `http://server:5005`) receive Flame's cookie. Give Flame its own hostname if you don't trust the other services on that host.

### API clients

Log in with `POST /api/auth` (JSON body `{"password": "...", "duration": "1d"}`) and keep the returned `flame_token` cookie, or send its value as `Authorization-Flame: Bearer <token>`.

Login (`POST /api/auth`) and logout (`POST /api/auth/logout`) always need an `X-Flame-CSRF: 1` header. Other requests that change data need it when they are authenticated by the cookie or by a forward-auth header; requests with `Authorization-Flame` don't.

```sh
curl -c cookies.txt -H 'X-Flame-CSRF: 1' -H 'Content-Type: application/json' \
  -d '{"password":"<password>","duration":"1h"}' http://localhost:5005/api/auth
```

## Forward-auth header

Your reverse proxy authenticates every request (e.g. Nginx Proxy Manager with Authentik forward auth) and passes the user name in a header. Flame trusts that header, so there is no second login.

| Variable | Description |
| --- | --- |
| `AUTH_PROXY_HEADER` | Header that carries the user name, e.g. `X-authentik-username` (Authentik) or `Remote-User` (Authelia). Unset disables forward-auth login. |
| `TRUST_PROXY` | **Required.** The proxy's IP address(es) or subnet(s), e.g. `172.18.0.5`. The header is only accepted when the TCP connection comes directly from one of them. `true` and hop counts are refused for forward auth, because they trust every client. |
| `AUTH_PROXY_LOGOUT_URL` | Optional. Where Flame's Logout button sends you to end the proxy session, e.g. `/outpost.goauthentik.io/sign_out`. Must be an `http(s)://` URL or a path starting with `/`. Without it, proxy sessions have no Logout button, because Flame can't end them. |

Requests carrying the header from any other address are ignored and logged, so a client can't simply send `X-authentik-username: admin` itself. To keep it that way:

- The proxy must **replace** the header on every request it forwards (nginx's `proxy_set_header` does), so clients can't pass their own value through it.
- Only the proxy may reach Flame from a trusted address. Don't publish Flame's port (drop `ports:` and reach it through the proxy only), and prefer the proxy container's fixed IP over a whole Docker subnet: connections through a published port can appear to come from the Docker network's gateway (e.g. `172.18.0.1`), which is inside `172.18.0.0/16`.

The proxy authenticates each request, so the header acts like the session cookie: requests that change data still need the `X-Flame-CSRF` header, and there is no session expiry on Flame's side.

## OIDC

Flame shows a "Log in with ..." button and uses the OpenID Connect authorization code flow with PKCE. Both `OIDC_DISCOVERY_URL` and `OIDC_CLIENT_ID` are required; if the settings are invalid, OIDC stays off and the reason is logged at startup.

| Variable | Default | Description |
| --- | --- | --- |
| `OIDC_DISCOVERY_URL` | | The provider's `.well-known/openid-configuration` URL (or its issuer URL). Must be the public URL your browser uses. |
| `OIDC_CLIENT_ID` | | Client ID. |
| `OIDC_CLIENT_SECRET` | | Client secret (or `OIDC_CLIENT_SECRET_FILE`). Leave unset for public clients. |
| `OIDC_REDIRECT_URI` | URL of the request | Recommended. `https://<flame-host>/api/auth/oidc/callback`; register exactly this URL with the provider. Must end in `/api/auth/oidc/callback`. |
| `OIDC_ALLOWED_GROUPS` | anyone | Comma-separated list. Only users in at least one of these groups can log in. |
| `OIDC_GROUPS_CLAIM` | `groups` | Claim with the user's groups, read from the ID token, or from userinfo when it isn't there. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Claim shown as the user name (falls back to `email`, then `sub`). |
| `OIDC_SCOPES` | `openid profile email` | Must include `openid`. |
| `OIDC_PROVIDER_NAME` | `SSO` | Button label: "Log in with `<name>`". |
| `OIDC_ALLOW_INSECURE_HTTP` | `false` | `true` allows plain-HTTP provider and redirect URLs. Only for testing. |

A successful login gives you the usual `flame_token` cookie for the duration chosen in the login form, so "Log out all sessions" covers OIDC sessions too. Changing the provider, client ID or allowed groups ends existing OIDC sessions. Flame's Logout ends the Flame session only, not the provider's. Discovery runs on the first login, so Flame starts even while the provider is down. If a login fails, the login page shows a short message and the details are in Flame's log.

## Authentik examples

`flame.example.com` is Flame's public hostname, `auth.example.com` Authentik's, and `172.18.0.5` the reverse proxy's address on the Docker network it shares with Flame (`docker network inspect <network>`; give the proxy a fixed `ipv4_address` so it can't change).

### Forward auth with Nginx Proxy Manager

1. In Authentik, go to **Applications > Applications > Create with provider**. Pick **Proxy Provider** in **Forward auth (single application)** mode, with the external host `https://flame.example.com`. Restrict access under the application's **Policy / Group / User Bindings**.
2. Under **Applications > Outposts**, add the application to the **authentik Embedded Outpost**.
3. In Nginx Proxy Manager, open the `flame.example.com` proxy host and follow the **Nginx Proxy Manager** tab of Authentik's [nginx guide](https://docs.goauthentik.io/add-secure-apps/providers/proxy/server_nginx/). The `/outpost.goauthentik.io` location goes in the **Advanced** tab, pointing at your Authentik server. The `auth_request` directives go on a `/` **Custom Location** that forwards to Flame. Keep these lines, which pass the user name and overwrite any value the client sent:

   ```nginx
   auth_request_set $authentik_username $upstream_http_x_authentik_username;
   proxy_set_header X-authentik-username $authentik_username;
   ```

   Enable **Websockets Support**; the weather widget uses a WebSocket.
4. Configure Flame:

   ```yaml
   environment:
     - AUTH_PROXY_HEADER=X-authentik-username
     - TRUST_PROXY=172.18.0.5
     - AUTH_PROXY_LOGOUT_URL=/outpost.goauthentik.io/sign_out
   ```

   On startup Flame logs `Forward-auth login enabled: trusting the X-authentik-username header from 172.18.0.5`. If it logs `Ignoring X-authentik-username header from <address>, which is not in TRUST_PROXY`, add that address to `TRUST_PROXY` after checking that it really is the proxy.

### OIDC

1. In Authentik, go to **Applications > Applications > Create with provider** and pick **OAuth2/OpenID Provider**. Client type **Confidential**. Add the strict redirect URI `https://flame.example.com/api/auth/oidc/callback` and select a signing key (e.g. the self-signed certificate).
2. Copy the **Client ID**, the **Client Secret** and, from the provider's overview page, the **OpenID Configuration URL**.
3. Configure Flame:

   ```yaml
   environment:
     - OIDC_DISCOVERY_URL=https://auth.example.com/application/o/flame/.well-known/openid-configuration
     - OIDC_CLIENT_ID=<client id>
     - OIDC_CLIENT_SECRET_FILE=/run/secrets/flame_oidc_client_secret
     - OIDC_REDIRECT_URI=https://flame.example.com/api/auth/oidc/callback
     - OIDC_PROVIDER_NAME=Authentik
     - OIDC_ALLOWED_GROUPS=Flame Admins # optional; Authentik sends group names in the `groups` claim
     - TRUST_PROXY=172.18.0.5 # so Flame sees HTTPS and marks cookies Secure
   ```

   Flame must be able to reach `auth.example.com` itself. Use the public URL, not an internal one such as `http://authentik-server:9000`, because the issuer and endpoints in the discovery document have to match what the browser uses.
