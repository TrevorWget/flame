const { DataTypes } = require('sequelize');
const { STRING } = DataTypes;

// `url` stays the internal URL. `preferredUrl` picks the one that is shown and
// opened ('internal' or 'external'); an empty choice falls back to the other.
const up = async (query) => {
  await query.addColumn('apps', 'externalUrl', {
    type: STRING,
    allowNull: false,
    defaultValue: '',
  });

  await query.addColumn('apps', 'preferredUrl', {
    type: STRING,
    allowNull: false,
    defaultValue: 'internal',
  });
};

const down = async (query) => {
  await query.removeColumn('apps', 'preferredUrl');
  await query.removeColumn('apps', 'externalUrl');
};

module.exports = {
  up,
  down,
};
