const { getProxyLogoutUrl } = require('./proxyAuth');

// Session as reported to the client. Proxy sessions have no expiry: the proxy
// authenticates every request.
const sessionInfo = ({ tokenPayload, proxyUser }) => {
  if (tokenPayload) {
    return {
      isAuthenticated: true,
      expiresAt: tokenPayload.exp * 1000,
      method: tokenPayload.sso || 'password',
      user: tokenPayload.sso ? tokenPayload.sub : null,
      logoutUrl: null,
    };
  }

  if (proxyUser) {
    return {
      isAuthenticated: true,
      expiresAt: null,
      method: 'proxy',
      user: proxyUser,
      logoutUrl: getProxyLogoutUrl(),
    };
  }

  return {
    isAuthenticated: false,
    expiresAt: null,
    method: null,
    user: null,
    logoutUrl: null,
  };
};

module.exports = sessionInfo;
