const fs = require('fs');
const { Sequelize } = require('sequelize');
const { join } = require('path');
const Umzug = require('umzug');

// Utils
const backupDB = require('./utils/backupDb');
const Logger = require('../utils/Logger');
const logger = new Logger();

const storage = './data/db.sqlite';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
});

const umzug = new Umzug({
  migrations: {
    path: join(__dirname, './migrations'),
    params: [sequelize.getQueryInterface()],
  },
  storage: 'sequelize',
  storageOptions: {
    sequelize,
  },
});

const connectDB = async () => {
  try {
    // authenticate() creates an empty file, so check before connecting
    const hasExistingDB =
      fs.existsSync(storage) && fs.statSync(storage).size > 0;

    await sequelize.authenticate();

    // execute all pending migrations
    const pendingMigrations = await umzug.pending();

    if (pendingMigrations.length > 0) {
      if (hasExistingDB) {
        let backupPath;

        try {
          backupPath = backupDB();
        } catch (error) {
          throw new Error(
            `could not back up the database before migrating, so no migrations were run (${error.message})`,
            { cause: error }
          );
        }

        logger.log(`Backed up the database to ${backupPath}`);
      }

      logger.log('Executing pending migrations');
      await umzug.up();
    }

    logger.log('Connected to database');
  } catch (error) {
    logger.log(`Unable to connect to the database: ${error.message}`, 'ERROR');
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  sequelize,
  umzug,
};
