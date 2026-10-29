const fs = require('fs');
const { join } = require('path');
const { sanitizeSvg } = require('../icons');
const Logger = require('../Logger');
const logger = new Logger();

const UPLOADS_DIR = join(__dirname, '../../data/uploads');

// The client inlines SVG icons into the page, so every stored SVG must be sanitized, not just new uploads
const sanitizeUploads = async () => {
  if (!fs.existsSync(UPLOADS_DIR)) return;

  const svgs = (await fs.promises.readdir(UPLOADS_DIR)).filter((file) =>
    /\.svg$/i.test(file)
  );

  for (const file of svgs) {
    const path = join(UPLOADS_DIR, file);

    try {
      const original = await fs.promises.readFile(path);
      const sanitized = sanitizeSvg(original);

      if (!sanitized) {
        logger.log(`Uploaded icon ${file} is not a valid SVG`, 'WARN');
      } else if (!sanitized.equals(original)) {
        await fs.promises.writeFile(path, sanitized);
        logger.log(`Sanitized uploaded icon ${file}`);
      }
    } catch (err) {
      logger.log(`Could not sanitize uploaded icon ${file}: ${err.message}`, 'WARN');
    }
  }
};

module.exports = sanitizeUploads;
