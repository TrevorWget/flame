const Logger = require('../../../utils/Logger');
const logger = new Logger();
const loadConfig = require('../../../utils/loadConfig');
const Category = require('../../../models/Category');
const { isAllowedUrl } = require('../../../utils/urlSchemes');
const { listRunningContainers } = require('./dockerApi');
const applyIntegrationApps = require('./applyIntegrationApps');
const warnOnce = require('./warnOnce');

const dockerDefaultCategory = {
  id: -2,
  name: 'Docker',
  type: 'apps',
  isPinned: true,
  orderId: 998,
};

const useDocker = async () => {
  const {
    useOrdering: orderType,
    unpinStoppedApps,
    dockerHost: host,
    extraUrlSchemes,
  } = await loadConfig();

  let containers = null;

  try {
    containers = await listRunningContainers(host);
  } catch (err) {
    logger.log(`Can't connect to the Docker API on ${host}: ${err.message}`, 'ERROR');
  }

  if (containers) {
    // Filter out containers without any labels
    containers = containers.filter(
      (e) => e.Labels && Object.keys(e.Labels).length !== 0
    );

    const dockerApps = [];

    const categories = await Category.findAll({
      where: {
        type: 'apps'
      },
      order: [[orderType, 'ASC']]
    });

    if (!categories.find(category => category.id === dockerDefaultCategory.id)) {
      categories.push(await Category.create(dockerDefaultCategory));
    }

    for (const container of containers) {
      let labels = container.Labels;

      // Traefik labels for URL configuration
      if (!('flame.url' in labels)) {
        for (const label of Object.keys(labels)) {
          if (/^traefik.*.frontend.rule/.test(label)) {
            // Traefik 1.x
            let value = labels[label];

            if (value.indexOf('Host') !== -1) {
              value = value.split('Host:')[1];
              labels['flame.url'] =
                'https://' + value.split(',').join(';https://');
            }
          } else if (/^traefik.*?\.rule/.test(label)) {
            // Traefik 2.x
            const value = labels[label];

            if (value.indexOf('Host') !== -1) {
              const regex = /\`([a-zA-Z0-9\.\-]+)\`/g;
              const domains = [];
              let match;

              while ((match = regex.exec(value)) != null) {
                domains.push('http://' + match[1]);
              }

              if (domains.length > 0) {
                labels['flame.url'] = domains.join(';');
              }
            }
          }
        }
      }

      // add each container as flame formatted app
      if (
        'flame.name' in labels &&
        'flame.url' in labels &&
        /^app/.test(labels['flame.type'])
      ) {
        const names = labels['flame.name'].split(';');
        const urls = labels['flame.url'].split(';');
        const externalUrls = labels['flame.url.external'] ? labels['flame.url.external'].split(';') : [];
        const categoriesLabels = labels['flame.category'] ? labels['flame.category'].split(';') : [];
        const orders = labels['flame.order'] ? labels['flame.order'].split(';') : [];
        const icons = labels['flame.icon'] ? labels['flame.icon'].split(';') : [];

        for (let i = 0; i < names.length; i++) {     
          const name = names[i] || names[0];
          const url = urls[i] || urls[0];

          if (!isAllowedUrl(url, extraUrlSchemes)) {
            warnOnce(
              `Skipping Docker app "${name}": URL is invalid or its scheme is not allowed`
            );
            continue;
          }

          // Without the label, the external URL set in the UI is kept
          let externalUrl = externalUrls[i] || externalUrls[0];

          if (externalUrl && !isAllowedUrl(externalUrl, extraUrlSchemes)) {
            warnOnce(
              `Ignoring the external URL of Docker app "${name}": URL is invalid or its scheme is not allowed`
            );
            externalUrl = undefined;
          }

          let category = categoriesLabels[i] ? categories.find(category => category.name.toUpperCase() === categoriesLabels[i].toUpperCase()) : dockerDefaultCategory;
          if (!category) {
            category = await createNewCategory(categoriesLabels[i]);
            if (category) {
              categories.push(category);
            } else {
              category = dockerDefaultCategory;
            }
          }

          dockerApps.push({
            name,
            url,
            ...(externalUrl ? { externalUrl } : {}),
            icon: icons[i] || 'docker',
            categoryId: category.id,
            orderId: orders[i] || 500,
          });
        }
      }
    }

    await applyIntegrationApps('docker', dockerApps, {
      defaultIcon: 'docker',
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

module.exports = useDocker;
