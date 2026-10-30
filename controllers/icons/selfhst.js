const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const { FetchError } = require('../../utils/safeFetch');
const {
  getIndex,
  searchIcons,
  suggestIcon,
  storeSelfhstIcon,
  getPreview,
} = require('../../utils/selfhst');

// Other download failures are 422 like /api/icons/fetch, so their message
// reaches the user (messages of 5xx responses are hidden)
const STATUS_BY_CODE = {
  INVALID: 400,
  UNAVAILABLE_VARIANT: 400,
  NOT_FOUND: 404,
  UNAVAILABLE: 503,
};

const toResponse = (err) =>
  err instanceof FetchError
    ? new ErrorResponse(err.message, STATUS_BY_CODE[err.code] || 422)
    : err;

const summary = ({ name, reference, svg, png, webp, light, dark, category }) => ({
  name,
  reference,
  svg,
  png,
  webp,
  light,
  dark,
  category,
});

// @desc      Search the selfh.st icon collection
// @route     GET /api/icons/selfhst/search
// @access    Private
const searchSelfhst = asyncWrapper(async (req, res, next) => {
  let index;

  try {
    index = await getIndex();
  } catch (err) {
    return next(toResponse(err));
  }

  const { icons, total } = searchIcons(index, req.query.q, req.query.limit);

  res.status(200).json({
    success: true,
    data: {
      icons: icons.map(summary),
      total,
      updatedAt: index.updatedAt,
      stale: index.stale,
    },
  });
});

// @desc      The selfh.st icon named like an app, if there is one
// @route     GET /api/icons/selfhst/suggest
// @access    Private
const suggestSelfhst = asyncWrapper(async (req, res) => {
  let icon = null;

  try {
    icon = suggestIcon(await getIndex(), req.query.name);
  } catch (err) {
    if (!(err instanceof FetchError)) throw err;
  }

  res.status(200).json({
    success: true,
    data: icon && summary(icon),
  });
});

// @desc      Preview image of a selfh.st icon for the icon picker
// @route     GET /api/icons/selfhst/preview/:reference
// @access    Private
const previewSelfhst = asyncWrapper(async (req, res, next) => {
  let preview;

  try {
    preview = await getPreview(req.params.reference, req.query.variant);
  } catch (err) {
    return next(toResponse(err));
  }

  res.set({
    'Content-Type': preview.contentType,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.status(200).send(preview.body);
});

// @desc      Download a selfh.st icon into the local icon cache
// @route     POST /api/icons/selfhst
// @access    Private
const storeSelfhst = asyncWrapper(async (req, res, next) => {
  const { reference, format, variant } = req.body;
  let icon;

  try {
    icon = await storeSelfhstIcon(reference, { format, variant });
  } catch (err) {
    return next(toResponse(err));
  }

  res.status(200).json({
    success: true,
    data: { icon },
  });
});

module.exports = {
  searchSelfhst,
  suggestSelfhst,
  previewSelfhst,
  storeSelfhst,
};
