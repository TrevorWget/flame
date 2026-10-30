const { readFile, writeFile } = require('fs/promises');

// Settings that hold a theme, saved as PAB - primary;accent;background
const THEME_KEYS = ['defaultTheme', 'lightTheme', 'darkTheme'];

const toPAB = ({ primary: p, accent: a, background: b }) => `${p};${a};${b}`;

const normalizeTheme = async () => {
  // open main config file
  const configFile = await readFile('data/config.json', 'utf8');
  const config = JSON.parse(configFile);

  // open default themes file
  const themesFile = await readFile('utils/init/themes.json', 'utf8');
  const { themes } = JSON.parse(themesFile);

  const changes = {};

  for (const key of THEME_KEYS) {
    const theme = themes.find((t) => t.name === config[key]);

    if (theme) changes[key] = toPAB(theme.colors);
  }

  if (Object.keys(changes).length) {
    await writeFile(
      'data/config.json',
      JSON.stringify({ ...config, ...changes })
    );
  }
};

module.exports = normalizeTheme;
module.exports.THEME_KEYS = THEME_KEYS;
module.exports.toPAB = toPAB;
