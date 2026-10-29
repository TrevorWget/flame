// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { parseIngressApps } = require('../controllers/apps/docker/kubernetesAnnotations');

const ingress = (annotations) => ({ metadata: { annotations } });

test('reads the name annotation and creates one app per ingress', () => {
  const apps = parseIngressApps([
    ingress({
      'flame.pawelmalak/type': 'application',
      'flame.pawelmalak/name': 'Grafana',
      'flame.pawelmalak/url': 'https://grafana.example.com',
    }),
  ]);

  assert.deepStrictEqual(apps, [
    {
      name: 'Grafana',
      url: 'https://grafana.example.com',
      icon: 'kubernetes',
      category: null,
      orderId: 500,
    },
  ]);
});

test('splits multi-app annotations and falls back to the first name/url', () => {
  const apps = parseIngressApps([
    ingress({
      'flame.pawelmalak/type': 'app',
      'flame.pawelmalak/name': 'Sonarr;Radarr',
      'flame.pawelmalak/url': 'https://media.example.com',
      'flame.pawelmalak/icon': 'television;movie',
      'flame.pawelmalak/category': ';Movies',
      'flame.pawelmalak/order': '1;2',
    }),
  ]);

  assert.deepStrictEqual(apps, [
    { name: 'Sonarr', url: 'https://media.example.com', icon: 'television', category: null, orderId: '1' },
    { name: 'Radarr', url: 'https://media.example.com', icon: 'movie', category: 'Movies', orderId: '2' },
  ]);
});

test('skips ingresses without flame annotations or with another type', () => {
  const apps = parseIngressApps([
    { metadata: {} },
    { metadata: { annotations: null } },
    ingress({}),
    ingress({ 'flame.pawelmalak/name': 'NoUrl', 'flame.pawelmalak/type': 'app' }),
    ingress({
      'flame.pawelmalak/type': 'bookmark',
      'flame.pawelmalak/name': 'Wiki',
      'flame.pawelmalak/url': 'https://wiki.example.com',
    }),
  ]);

  assert.deepStrictEqual(apps, []);
});
