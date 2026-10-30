const schedule = require('node-schedule');
const loadConfig = require('./loadConfig');
const { saveBackup } = require('./backup');
const Logger = require('./Logger');
const logger = new Logger();

const BACKUP_JOB = 'scheduledBackup';

// Server local time
const SCHEDULES = {
  daily: '0 30 3 * * *',
  weekly: '0 30 3 * * 0',
};

let activeRule = null;

const runScheduledBackup = async () => {
  try {
    const { backupRetention } = await loadConfig();
    const name = await saveBackup(backupRetention || 7);

    logger.log(`Saved scheduled backup ${name}`);
  } catch (err) {
    logger.log(`Scheduled backup failed: ${err.message}`, 'ERROR');
  }
};

// Starts, changes or stops the backup job to match the current config
const syncBackupJobs = async () => {
  const { backupSchedule } = await loadConfig();
  const rule = SCHEDULES[backupSchedule] || null;

  if (rule === activeRule) return rule;

  schedule.cancelJob(BACKUP_JOB);

  if (rule) {
    schedule.scheduleJob(BACKUP_JOB, rule, runScheduledBackup);
    logger.log(`Scheduled ${backupSchedule} backups`);
  } else {
    logger.log('Scheduled backups stopped');
  }

  activeRule = rule;

  return rule;
};

module.exports = { syncBackupJobs, runScheduledBackup };
