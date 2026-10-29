const fs = require('fs');

const sessionsFile = 'data/sessions.json';

let cachedVersion;

// Embedded in tokens; bumping it ("log out all sessions") invalidates every
// token issued before
const getTokenVersion = () => {
  if (cachedVersion === undefined) {
    try {
      const { tokenVersion } = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
      cachedVersion = Number.isInteger(tokenVersion) ? tokenVersion : 0;
    } catch {
      cachedVersion = 0;
    }
  }

  return cachedVersion;
};

const bumpTokenVersion = () => {
  const tokenVersion = getTokenVersion() + 1;

  fs.writeFileSync(sessionsFile, JSON.stringify({ tokenVersion }));
  cachedVersion = tokenVersion;

  return tokenVersion;
};

module.exports = { getTokenVersion, bumpTokenVersion };
