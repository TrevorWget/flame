// e.g. db-250-20261029T144501123Z-backup.sqlite
const slugify = (date = new Date()) => {
  const version = (process.env.VERSION || 'unknown').replace(/\./g, '');
  const timestamp = date.toISOString().replace(/[-:.]/g, '');
  return `db-${version}-${timestamp}-backup.sqlite`;
};

const parseSlug = (slug) => {
  const parts = slug.split('-');
  const version = {
    raw: parts[1],
    parsed: parts[1].split('').join('.'),
  };
  return version;
};

module.exports = {
  slugify,
  parseSlug,
};
