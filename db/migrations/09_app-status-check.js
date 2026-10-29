const { DataTypes } = require('sequelize');
const { BOOLEAN, STRING } = DataTypes;

// Status indicator settings per app: statusCheck = false opts the app out,
// statusUrl checks another address than the one the app links to
const up = async (query) => {
  await query.addColumn('apps', 'statusCheck', {
    type: BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });

  await query.addColumn('apps', 'statusUrl', {
    type: STRING,
    allowNull: true,
    defaultValue: null,
  });
};

const down = async (query) => {
  await query.removeColumn('apps', 'statusUrl');
  await query.removeColumn('apps', 'statusCheck');
};

module.exports = {
  up,
  down,
};
