const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const Category = require('../../models/Category');
const loadConfig = require('../../utils/loadConfig');
const { getStatuses } = require('../../utils/statusChecks');

// Guests see the public apps of public categories, as in GET /api/categories
const visibleAppIds = async (isAuthenticated) => {
  const apps = await App.findAll({
    attributes: ['id'],
    ...(isAuthenticated
      ? {}
      : {
          where: { isPublic: true },
          include: [
            {
              model: Category,
              attributes: [],
              where: { isPublic: true },
              required: true,
            },
          ],
        }),
  });

  return apps.map(({ id }) => id);
};

// @desc      Get the latest status check results of the visible apps
// @route     GET /api/apps/status
// @access    Public
const getAppStatus = asyncWrapper(async (req, res, next) => {
  const { statusChecks } = await loadConfig();
  const results = getStatuses();
  const data = { enabled: Boolean(statusChecks), statuses: {} };

  if (statusChecks && results.size) {
    for (const id of await visibleAppIds(req.isAuthenticated)) {
      if (results.has(id)) {
        data.statuses[id] = results.get(id);
      }
    }
  }

  // Results only change when a status does, so revalidating with the ETag
  // usually ends in a body-less 304
  res
    .status(200)
    .setHeader('Cache-Control', 'private, no-cache')
    .json({ success: true, data });
});

module.exports = getAppStatus;
