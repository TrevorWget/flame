// Fails when `npm audit --omit=dev` reports a high/critical advisory in a
// package that is reachable from a production dependency other than the
// ignored roots below. Advisories reachable only through ignored roots are
// listed but don't fail the build.
//
// Usage: node .github/scripts/audit-gate.js <server|client>
const { spawnSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const FAIL_LEVELS = ['high', 'critical'];

const PROJECTS = {
  server: {
    dir: '.',
    ignoredRoots: {},
  },
  client: {
    dir: 'client',
    // Build, lint and test tooling are devDependencies, so `dependencies` is
    // exactly what ships in the bundle
    ignoredRoots: {},
  },
};

const projectName = process.argv[2];
const project = PROJECTS[projectName];

if (!project) {
  console.error(`Usage: audit-gate.js <${Object.keys(PROJECTS).join('|')}>`);
  process.exit(2);
}

const cwd = join(__dirname, '../..', project.dir);

const isIgnoredRoot = (name) =>
  Object.keys(project.ignoredRoots).some((pattern) =>
    pattern.endsWith('/*')
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern
  );

const runAudit = () => {
  const result = spawnSync('npm audit --omit=dev --json', {
    cwd,
    encoding: 'utf-8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });

  let report;

  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(result.stderr || result.stdout);
    throw new Error('npm audit did not return JSON');
  }

  if (report.error) {
    throw new Error(`npm audit failed: ${report.error.summary || report.error.code}`);
  }

  return report;
};

// Lockfile paths of every package reachable from the non-ignored production
// dependencies, following Node's node_modules resolution
const reachablePaths = () => {
  const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf-8'));
  const packages = lock.packages;

  const resolve = (fromPath, name) => {
    let base = fromPath;

    for (;;) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;

      if (packages[candidate]) return candidate;
      if (!base) return null;

      const index = base.lastIndexOf('node_modules/');
      base = base.slice(0, index).replace(/\/$/, '');
    }
  };

  const depNames = (entry, includeOptional) => [
    ...Object.keys(entry.dependencies || {}),
    ...Object.keys(entry.peerDependencies || {}),
    ...(includeOptional ? Object.keys(entry.optionalDependencies || {}) : []),
  ];

  const seen = new Set();
  const queue = depNames(packages[''], true)
    .filter((name) => !isIgnoredRoot(name))
    .map((name) => resolve('', name))
    .filter(Boolean);

  while (queue.length) {
    const path = queue.pop();

    if (seen.has(path)) continue;
    seen.add(path);

    for (const name of depNames(packages[path], true)) {
      const resolved = resolve(path, name);

      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
};

const main = () => {
  const report = runAudit();
  const reachable = reachablePaths();
  const blocking = [];
  const ignored = [];

  for (const vuln of Object.values(report.vulnerabilities || {})) {
    const advisories = vuln.via.filter((via) => typeof via === 'object');

    if (!advisories.length) continue;

    const isReachable = vuln.nodes.some((node) => reachable.has(node));

    for (const advisory of advisories) {
      const entry = `${advisory.severity.padEnd(8)} ${vuln.name}: ${advisory.title} (${advisory.url})`;

      if (isReachable && FAIL_LEVELS.includes(advisory.severity)) {
        blocking.push(entry);
      } else {
        ignored.push(entry);
      }
    }
  }

  console.log(`npm audit --omit=dev (${projectName})`);
  console.log(`Fails on: ${FAIL_LEVELS.join(', ')}`);
  console.log('Ignored roots:');
  for (const [root, reason] of Object.entries(project.ignoredRoots)) {
    console.log(`  ${root}: ${reason}`);
  }

  if (ignored.length) {
    console.log(`\nNon-blocking advisories (${ignored.length}):`);
    for (const entry of [...new Set(ignored)].sort()) console.log(`  ${entry}`);
  }

  if (blocking.length) {
    console.log(`\nBlocking advisories (${blocking.length}):`);
    for (const entry of [...new Set(blocking)].sort()) console.log(`  ${entry}`);
    process.exit(1);
  }

  console.log('\nNo blocking advisories.');
};

main();
