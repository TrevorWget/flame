const crypto = require('crypto');
const fs = require('fs');
const { join } = require('path');

const Logger = require('../Logger');
const logger = new Logger();

const secretLocation = 'data/.secret';
const secretFullPath = join(__dirname, '../../', secretLocation);

// Committed to the repo's .env before v2.4.0; tokens signed with it are forgeable
const LEAKED_SECRETS = [
  'e02eb43d69953658c6d07311d6313f2d4467672cb881f96b29368ba1f3f4da4b',
];

const MIN_SECRET_BYTES = 32;

const initSecret = () => {
  if (process.env.SECRET) {
    if (LEAKED_SECRETS.includes(process.env.SECRET.trim())) {
      logger.log(
        'SECRET is set to the publicly leaked value from old Flame releases. Remove SECRET from your environment (Flame will generate one in data/.secret) or replace it with a new random value, e.g. `openssl rand -hex 32`.',
        'ERROR'
      );
      process.exit(1);
    }

    if (Buffer.byteLength(process.env.SECRET) < MIN_SECRET_BYTES) {
      logger.log(
        `SECRET is shorter than ${MIN_SECRET_BYTES} bytes, which makes tokens easier to forge. Use a longer random value or unset SECRET to have one generated.`,
        'WARN'
      );
    }

    return;
  }

  if (fs.existsSync(secretFullPath)) {
    const storedSecret = fs.readFileSync(secretFullPath, 'utf-8').trim();

    if (storedSecret) {
      process.env.SECRET = storedSecret;
      logger.log(`Loaded JWT secret from ${secretLocation}`);

      return;
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');
  process.env.SECRET = secret;

  const dataDir = join(__dirname, '../../data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(secretFullPath, secret);
  logger.log(`Generated new JWT secret and saved to ${secretLocation}`);
};

module.exports = initSecret;
