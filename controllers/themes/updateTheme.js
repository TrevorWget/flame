const { writeFile } = require('fs/promises');
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const File = require('../../utils/File');
const loadConfig = require('../../utils/loadConfig');
const { THEME_KEYS, toPAB } = require('../../utils/init/normalizeTheme');

// @desc      Update theme
// @route     PUT /api/themes/:name
// @access    Public
const updateTheme = asyncWrapper(async (req, res, next) => {
  const file = new File('data/themes.json');
  let content = JSON.parse(file.read());

  let themeIdx = content.themes.findIndex((t) => t.name == req.params.name);

  if (themeIdx < 0) {
    return next(new ErrorResponse('Theme not found', 404));
  }

  const renamedOnto = content.themes.findIndex((t) => t.name == req.body.name);

  if (renamedOnto > -1 && renamedOnto !== themeIdx) {
    return next(new ErrorResponse('Name must be unique', 400));
  }

  const previous = toPAB(content.themes[themeIdx].colors);

  content.themes = [
    ...content.themes.slice(0, themeIdx),
    req.body,
    ...content.themes.slice(themeIdx + 1),
  ];

  file.write(content, true);

  // Settings store a theme by its colors, so they follow the edit
  const config = await loadConfig();
  const changes = {};

  for (const key of THEME_KEYS) {
    if (config[key] === previous) changes[key] = toPAB(req.body.colors);
  }

  if (Object.keys(changes).length) {
    await writeFile(
      'data/config.json',
      JSON.stringify({ ...config, ...changes })
    );
  }

  const userThemes = content.themes.filter((t) => t.isCustom);

  res.status(200).json({
    success: true,
    data: userThemes,
  });
});

module.exports = updateTheme;
