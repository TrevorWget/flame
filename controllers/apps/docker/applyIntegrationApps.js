const App = require('../../../models/App');
const { clearStaleVariants } = require('../../../utils/iconVariants');

// Creates or updates the apps an integration discovered and tags them with
// `source`. With `unpinMissing`, apps previously synced from the same source
// that were not discovered this time are unpinned; manual apps are never
// unpinned. An existing app with the same name is taken over by the integration.
//
// An icon of 'custom', or the integration's default icon when the app already
// has another one, keeps the icon set in the UI.
const applyIntegrationApps = async (
  source,
  items,
  { defaultIcon, unpinMissing = false }
) => {
  const apps = await App.findAll();
  const discovered = new Set();

  for (const item of items) {
    discovered.add(item.name);

    const { icon, ...fields } = item;
    const app = apps.find((a) => a.name === item.name);

    if (app) {
      const keepIcon =
        icon === 'custom' || (icon === defaultIcon && app.icon !== defaultIcon);

      await app.update(
        clearStaleVariants(
          { ...fields, ...(keepIcon ? {} : { icon }), source, isPinned: true },
          app
        )
      );
    } else {
      apps.push(
        await App.create({
          ...fields,
          icon: icon === 'custom' ? defaultIcon : icon,
          source,
          isPinned: true,
        })
      );
    }
  }

  if (unpinMissing) {
    for (const app of apps) {
      if (app.source === source && app.isPinned && !discovered.has(app.name)) {
        await app.update({ isPinned: false });
      }
    }
  }
};

module.exports = applyIntegrationApps;
