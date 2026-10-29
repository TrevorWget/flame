const { DataTypes } = require('sequelize');
const { STRING } = DataTypes;

// Integration that created/last synced the app ('docker', 'kubernetes'); null for manual apps
const up = async (query) => {
  await query.addColumn('apps', 'source', {
    type: STRING,
    allowNull: true,
    defaultValue: null,
  });
};

const down = async (query) => {
  await query.removeColumn('apps', 'source');
};

module.exports = {
  up,
  down,
};
