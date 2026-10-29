const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const loadConfig = require('../../utils/loadConfig');
const { fetchAndStoreIcon } = require('../../utils/favicon');
const { iconSourceUrl } = require('../../utils/autoFetchIcon');
const { FetchError } = require('../../utils/safeFetch');

// @desc      Download a site's icon (or an icon URL) into the local icon cache
// @route     POST /api/icons/fetch
// @access    Private
const fetchIcon = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();
  const url = iconSourceUrl(req.body.url, config.extraUrlSchemes);

  if (!url) {
    return next(
      new ErrorResponse('Icons can only be fetched from http and https URLs', 400)
    );
  }

  try {
    const icon = await fetchAndStoreIcon(url, {
      allowPrivate: Boolean(config.iconFetchAllowPrivate),
      refresh: true,
    });

    res.status(200).json({
      success: true,
      data: { icon },
    });
  } catch (err) {
    if (err instanceof FetchError) {
      return next(new ErrorResponse(err.message, 422));
    }

    throw err;
  }
});

module.exports = fetchIcon;
