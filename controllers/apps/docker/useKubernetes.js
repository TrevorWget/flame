const Logger = require('../../../utils/Logger');
const logger = new Logger();
const loadConfig = require('../../../utils/loadConfig');
const Category = require('../../../models/Category');
const { isAllowedUrl } = require('../../../utils/urlSchemes');
const { parseIngressApps } = require('./kubernetesAnnotations');
const applyIntegrationApps = require('./applyIntegrationApps');
const warnOnce = require('./warnOnce');

// @kubernetes/client-node 1.x is ESM-only
let k8sModule;
const loadK8s = () => (k8sModule ??= import('@kubernetes/client-node'));

const listIngresses = async () => {
  const k8s = await loadK8s();
  const kc = new k8s.KubeConfig();

  // In-cluster service account by default; KUBECONFIG allows running outside the cluster
  if (process.env.KUBECONFIG) {
    kc.loadFromDefault();
  } else {
    kc.loadFromCluster();
  }

  const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
  const { items } = await networkingApi.listIngressForAllNamespaces();

  return items;
};

const kubernetesDefaultCategory = {
  id: -3,
  name: 'Kubernetes',
  type: 'apps',
  isPinned: true,
  orderId: 999,
};

const useKubernetes = async () => {
  const {
    useOrdering: orderType,
    unpinStoppedApps,
    extraUrlSchemes,
  } = await loadConfig();

  let ingresses = null;

  try {
    ingresses = await listIngresses();
  } catch (err) {
    logger.log(`Can't connect to the Kubernetes API: ${err.message}`, 'ERROR');
  }

  if (ingresses) {
    const kubernetesApps = [];

    const categories = await Category.findAll({
      where: {
        type: 'apps'
      },
      order: [[orderType, 'ASC']]
    });

    if (!categories.find(category => category.id === kubernetesDefaultCategory.id)) {
      categories.push(await Category.create(kubernetesDefaultCategory));
    }

    for (const { category: categoryLabel, ...app } of parseIngressApps(ingresses)) {
      if (!isAllowedUrl(app.url, extraUrlSchemes)) {
        warnOnce(
          `Skipping Kubernetes app "${app.name}": URL is invalid or its scheme is not allowed`
        );
        continue;
      }

      if (app.externalUrl && !isAllowedUrl(app.externalUrl, extraUrlSchemes)) {
        warnOnce(
          `Ignoring the external URL of Kubernetes app "${app.name}": URL is invalid or its scheme is not allowed`
        );
        delete app.externalUrl;
      }

      let category = categoryLabel
        ? categories.find(
            (category) => category.name.toUpperCase() === categoryLabel.toUpperCase()
          )
        : kubernetesDefaultCategory;
      if (!category) {
        category = await createNewCategory(categoryLabel);
        if (category) {
          categories.push(category);
        } else {
          category = kubernetesDefaultCategory;
        }
      }

      kubernetesApps.push({
        ...app,
        categoryId: category.id,
      });
    }

    await applyIntegrationApps('kubernetes', kubernetesApps, {
      defaultIcon: 'kubernetes',
      unpinMissing: unpinStoppedApps,
    });
  }
};

// TODO : Move somewhere else ?
async function createNewCategory(newCategoryName) {
  return await Category.create({
    name: newCategoryName,
    type: 'apps',
    isPinned: true,
    orderId: Number.MAX_SAFE_INTEGER //New category will always be last and can then be re-ordered manually by user
  });
}

module.exports = useKubernetes;
