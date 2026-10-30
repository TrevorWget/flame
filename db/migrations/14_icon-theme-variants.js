const { DataTypes } = require('sequelize');
const { STRING } = DataTypes;

// Icons shown instead of `icon` on dark and on light themes (null shows `icon`)
const TABLES = ['apps', 'bookmarks'];
const COLUMNS = ['iconOnDark', 'iconOnLight'];

const up = async (query) => {
  for (const table of TABLES) {
    for (const column of COLUMNS) {
      await query.addColumn(table, column, {
        type: STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  }
};

const down = async (query) => {
  for (const table of TABLES) {
    for (const column of COLUMNS) {
      await query.removeColumn(table, column);
    }
  }
};

module.exports = {
  up,
  down,
};
