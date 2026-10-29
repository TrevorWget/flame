const { useKubernetes, useDocker } = require('../../controllers/apps/docker');
const loadConfig = require('../loadConfig');

const initIntegrationsApps = async () => {
  const {
    dockerApps: useDockerAPI,
    kubernetesApps: useKubernetesAPI,
  } = await loadConfig();

  if (useDockerAPI) {
    await useDocker();
  }

  if (useKubernetesAPI) {
    await useKubernetes();
  }
};

module.exports = initIntegrationsApps;
