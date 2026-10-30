const DAY_MS = 86400000;
const J1970 = 2440587.5;
const J2000 = 2451545;
const rad = Math.PI / 180;

// Sun's upper limb on the horizon, with atmospheric refraction
const SUN_ALTITUDE = -0.833 * rad;

const toJulian = (ms) => ms / DAY_MS + J1970;
const fromJulian = (j) => (j - J1970) * DAY_MS;

const minutesOfDay = (ms) =>
  Math.round((((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60000) % 1440;

const hasLocation = ({ lat, long }) =>
  typeof lat === 'number' &&
  typeof long === 'number' &&
  !(lat === 0 && long === 0);

/**
 * Sunrise and sunset on the solar day around `date` at a location, using the
 * sunrise equation (accurate to a few minutes). Times are minutes after UTC
 * midnight, so they can be shared without revealing the coordinates. `polar`
 * is 'day' or 'night' when the sun doesn't rise or set at all.
 *
 * @returns {{ sunrise: number|null, sunset: number|null, polar: 'day'|'night'|null }}
 */
const getSunTimes = (lat, long, date = new Date()) => {
  const n = Math.ceil(toJulian(date.getTime()) - J2000 + 0.0008);
  const meanSolarTime = n - long / 360;

  const M = ((357.5291 + 0.98560028 * meanSolarTime) % 360) * rad;
  const C =
    (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) *
    rad;
  const lambda = (M + C + Math.PI + 102.9372 * rad) % (2 * Math.PI);
  const transit =
    J2000 + meanSolarTime + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lambda);

  const declination = Math.asin(Math.sin(lambda) * Math.sin(23.4397 * rad));
  const phi = lat * rad;
  const cosHourAngle =
    (Math.sin(SUN_ALTITUDE) - Math.sin(phi) * Math.sin(declination)) /
    (Math.cos(phi) * Math.cos(declination));

  if (cosHourAngle > 1) return { sunrise: null, sunset: null, polar: 'night' };
  if (cosHourAngle < -1) return { sunrise: null, sunset: null, polar: 'day' };

  const hourAngle = Math.acos(cosHourAngle) / (2 * Math.PI);

  return {
    sunrise: minutesOfDay(fromJulian(transit - hourAngle)),
    sunset: minutesOfDay(fromJulian(transit + hourAngle)),
    polar: null,
  };
};

/** Sun times for the theme schedule, or null when they aren't used */
const themeSunTimes = (config, date = new Date()) => {
  if (
    config.themeMode !== 'time' ||
    config.themeSchedule !== 'sun' ||
    !hasLocation(config)
  ) {
    return null;
  }

  return getSunTimes(config.lat, config.long, date);
};

module.exports = { getSunTimes, themeSunTimes, hasLocation };
