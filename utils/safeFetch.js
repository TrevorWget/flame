const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const zlib = require('zlib');

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (compatible; Flame icon fetcher)';

class FetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
  }
}

const blockList = (ranges) => {
  const list = new net.BlockList();

  for (const [network, prefix, type] of ranges) {
    list.addSubnet(network, prefix, type);
  }

  return list;
};

// Never reachable targets, whatever the settings say
const FORBIDDEN = blockList([
  ['0.0.0.0', 8, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
]);

// Loopback, LAN, link-local and other non-global ranges. Only reachable when
// the admin allows private hosts (self-hosted apps usually live here).
const PRIVATE = blockList([
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['::1', 128, 'ipv6'],
  ['100::', 64, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
]);

const ipv6ToBytes = (address) => {
  let value = address;
  let tail = [];

  // Trailing dotted quad, e.g. ::ffff:127.0.0.1
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (dotted) {
    tail = dotted[1].split('.').map(Number);
    value = value.slice(0, -dotted[1].length) + '0:0';
  }

  const [head, rest] = value.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest ? rest.split(':') : [];
  const missing = 8 - headGroups.length - restGroups.length;
  const groups = [
    ...headGroups,
    ...Array(value.includes('::') ? missing : 0).fill('0'),
    ...restGroups,
  ].map((group) => parseInt(group, 16));

  const bytes = groups.flatMap((group) => [group >> 8, group & 0xff]);

  if (tail.length) {
    bytes.splice(12, 4, ...tail);
  }

  return bytes;
};

// IPv6 forms that carry an IPv4 address the packets actually go to
const embeddedIpv4 = (address) => {
  const bytes = ipv6ToBytes(address);
  const isZero = (from, to) => bytes.slice(from, to).every((b) => b === 0);

  const isLoopback = isZero(0, 15) && bytes[15] === 1;

  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (deprecated compatible)
  if (
    isZero(0, 10) &&
    ((bytes[10] === 0xff && bytes[11] === 0xff) || (isZero(10, 12) && !isLoopback))
  ) {
    return bytes.slice(12, 16).join('.');
  }

  // 64:ff9b::/96 (NAT64)
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && isZero(4, 12)) {
    return bytes.slice(12, 16).join('.');
  }

  // 2002::/16 (6to4)
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return bytes.slice(2, 6).join('.');
  }

  return null;
};

/**
 * 'public', 'private' (blocked unless private hosts are allowed) or
 * 'forbidden' (always blocked, including anything that isn't an IP address)
 */
const classifyAddress = (rawAddress) => {
  const address = String(rawAddress).replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(address);

  if (family === 4) {
    if (FORBIDDEN.check(address, 'ipv4')) return 'forbidden';
    return PRIVATE.check(address, 'ipv4') ? 'private' : 'public';
  }

  if (family === 6) {
    const ipv4 = embeddedIpv4(address);
    if (ipv4) return classifyAddress(ipv4);

    if (FORBIDDEN.check(address, 'ipv6')) return 'forbidden';
    return PRIVATE.check(address, 'ipv6') ? 'private' : 'public';
  }

  return 'forbidden';
};

const lookupAll = (hostname) =>
  new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) =>
      err ? reject(err) : resolve(addresses)
    );
  });

/**
 * Resolves the host and returns the first address the fetch may connect to.
 * The request is then pinned to that address, so a second DNS answer can't
 * point it somewhere else (DNS rebinding).
 */
const resolveTarget = async (hostname, { allowPrivate, lookup = lookupAll }) => {
  const host = hostname.replace(/^\[|\]$/g, '');
  let addresses;

  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new FetchError(`Could not resolve ${host}`, 'DNS');
    }
  }

  let sawPrivate = false;

  for (const { address, family } of addresses) {
    const kind = classifyAddress(address);

    if (kind === 'public' || (kind === 'private' && allowPrivate)) {
      return { address, family, isPrivate: kind === 'private' };
    }

    sawPrivate = sawPrivate || kind === 'private';
  }

  throw new FetchError(
    sawPrivate
      ? `${host} is on a private network. Turn on "Allow fetching icons from private network addresses" in Settings > General to fetch icons from it`
      : `${host} does not resolve to an address icons can be fetched from`,
    'BLOCKED'
  );
};

const decoderFor = (encoding) => {
  switch ((encoding || '').trim().toLowerCase()) {
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      throw new FetchError(`Unsupported content encoding ${encoding}`, 'ENCODING');
  }
};

const requestOnce = (url, target, { maxBytes, truncate, signal, accept }) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',
        signal,
        // A fresh connection per request, so it always goes to `target`
        agent: false,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Encoding': 'gzip, deflate, br',
        },
        // Connect to the address that was checked, never re-resolve
        lookup: (hostname, options, callback) => {
          if (options && options.all) {
            callback(null, [{ address: target.address, family: target.family }]);
          } else {
            callback(null, target.address, target.family);
          }
        },
        // LAN services commonly use self-signed certificates. Whatever is
        // fetched is only ever stored as a validated, sanitized image.
        rejectUnauthorized: !target.isPrivate,
      },
      (res) => {
        const { statusCode, headers } = res;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          return resolve({ redirect: headers.location });
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          return reject(new FetchError(`${url.href} returned HTTP ${statusCode}`, 'HTTP'));
        }

        const declared = Number(headers['content-length']);
        if (!truncate && declared > maxBytes && !headers['content-encoding']) {
          res.destroy();
          return reject(new FetchError(`${url.href} is larger than ${maxBytes} bytes`, 'TOO_LARGE'));
        }

        let stream = res;

        try {
          const decoder = decoderFor(headers['content-encoding']);
          if (decoder) {
            stream = res.pipe(decoder);
            decoder.on('error', (err) =>
              reject(new FetchError(`Could not decode ${url.href}: ${err.message}`, 'ENCODING'))
            );
          }
        } catch (err) {
          res.destroy();
          return reject(err);
        }

        const chunks = [];
        let size = 0;
        let done = false;

        const finish = () => {
          if (done) return;
          done = true;
          resolve({
            url: url.href,
            contentType: (headers['content-type'] || '').toLowerCase(),
            body: Buffer.concat(chunks).subarray(0, maxBytes),
            truncated: size > maxBytes,
          });
        };

        stream.on('data', (chunk) => {
          if (done) return;

          size += chunk.length;
          chunks.push(chunk);

          if (size > maxBytes) {
            res.destroy();
            stream.destroy();

            if (truncate) {
              finish();
            } else {
              done = true;
              reject(new FetchError(`${url.href} is larger than ${maxBytes} bytes`, 'TOO_LARGE'));
            }
          }
        });
        stream.on('end', finish);
        stream.on('error', (err) => {
          if (done) return;
          done = true;
          reject(
            signal && signal.aborted
              ? new FetchError(`Timed out fetching ${url.href}`, 'TIMEOUT')
              : new FetchError(`Could not fetch ${url.href}: ${err.message}`, 'NETWORK')
          );
        });
      }
    );

    req.on('error', (err) => {
      if (signal && signal.aborted) {
        reject(new FetchError(`Timed out fetching ${url.href}`, 'TIMEOUT'));
      } else if (err instanceof FetchError) {
        reject(err);
      } else {
        reject(new FetchError(`Could not fetch ${url.href}: ${err.message}`, 'NETWORK'));
      }
    });

    req.end();
  });

const parseHttpUrl = (value, base) => {
  let url;

  try {
    url = new URL(value, base);
  } catch {
    throw new FetchError(`Invalid URL ${value}`, 'URL');
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new FetchError(`Only http and https URLs can be fetched`, 'SCHEME');
  }

  if (url.username || url.password) {
    throw new FetchError('URLs with credentials can not be fetched', 'URL');
  }

  return url;
};

/**
 * GET an http(s) URL without letting it reach blocked addresses: every
 * redirect is re-checked, the body is capped at maxBytes (truncated or
 * rejected) and the whole exchange must finish within timeoutMs.
 */
const safeFetch = async (
  rawUrl,
  {
    allowPrivate = false,
    maxBytes = 1024 * 1024,
    truncate = false,
    timeoutMs = 8000,
    accept = '*/*',
    lookup,
  } = {}
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = parseHttpUrl(rawUrl);

    for (let redirects = 0; ; redirects++) {
      const timedOut = new Promise((resolve, reject) => {
        const onAbort = () =>
          reject(new FetchError(`Timed out fetching ${url.href}`, 'TIMEOUT'));

        if (controller.signal.aborted) onAbort();
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      timedOut.catch(() => {});

      const target = await Promise.race([
        resolveTarget(url.hostname, { allowPrivate, lookup }),
        timedOut,
      ]);

      const result = await requestOnce(url, target, {
        maxBytes,
        truncate,
        accept,
        signal: controller.signal,
      });

      if (!result.redirect) {
        return result;
      }

      if (redirects >= MAX_REDIRECTS) {
        throw new FetchError(`Too many redirects from ${rawUrl}`, 'REDIRECTS');
      }

      url = parseHttpUrl(result.redirect, url);
    }
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  FetchError,
  classifyAddress,
  resolveTarget,
  safeFetch,
};
