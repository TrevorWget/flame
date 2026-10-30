module.exports = {
  login: require('./login'),
  validate: require('./validate'),
  getSession: require('./getSession'),
  getProviders: require('./getProviders'),
  oidcLogin: require('./oidcLogin'),
  oidcCallback: require('./oidcCallback'),
  logout: require('./logout'),
  logoutAll: require('./logoutAll'),
};
