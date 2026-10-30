// TRUST_PROXY accepts true, a hop count, or Express' subnet list syntax
const parseTrustProxy = (value) => {
  const trustProxy = (value || '').trim();

  if (!trustProxy || trustProxy === 'false') return false;
  if (trustProxy === 'true') return true;
  if (/^\d+$/.test(trustProxy)) return Number(trustProxy);

  return trustProxy;
};

module.exports = { parseTrustProxy };
