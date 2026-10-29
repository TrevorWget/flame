const { getPasswordProblem } = require('../password');
const Logger = require('../Logger');
const logger = new Logger();

const initPassword = () => {
  const problem = getPasswordProblem();

  if (problem) {
    logger.log(
      `${problem}. Login is DISABLED and the dashboard is read-only until you set PASSWORD (or PASSWORD_FILE / a docker secret) to a strong, non-default value.`,
      'ERROR'
    );
  }
};

module.exports = initPassword;
