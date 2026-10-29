const PREFIX = 'flame.pawelmalak/';

const splitAnnotation = (annotations, key) => {
  const value = annotations[PREFIX + key];
  return typeof value === 'string' && value !== '' ? value.split(';') : [];
};

// Turns ingress annotations into app entries. One ingress can describe
// several apps by separating values with ';'; missing names/urls fall back to
// the first value, missing icons/categories/orders to the defaults.
const parseIngressApps = (ingresses) => {
  const apps = [];

  for (const ingress of ingresses || []) {
    const annotations = (ingress && ingress.metadata && ingress.metadata.annotations) || {};

    if (
      !(PREFIX + 'name' in annotations) ||
      !(PREFIX + 'url' in annotations) ||
      !/^app/.test(annotations[PREFIX + 'type'])
    ) {
      continue;
    }

    const names = splitAnnotation(annotations, 'name');
    const urls = splitAnnotation(annotations, 'url');
    const externalUrls = splitAnnotation(annotations, 'url.external');
    const categories = splitAnnotation(annotations, 'category');
    const orders = splitAnnotation(annotations, 'order');
    const icons = splitAnnotation(annotations, 'icon');

    for (let i = 0; i < names.length; i++) {
      const externalUrl = externalUrls[i] || externalUrls[0];

      apps.push({
        name: names[i] || names[0],
        url: urls[i] || urls[0],
        // Left out without the annotation, so the external URL set in the UI is kept
        ...(externalUrl ? { externalUrl } : {}),
        icon: icons[i] || 'kubernetes',
        category: categories[i] || null,
        orderId: orders[i] || 500,
      });
    }
  }

  return apps;
};

module.exports = { parseIngressApps };
