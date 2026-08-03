#!/usr/bin/env node
/**
 * Post-deploy verification for a Safe App's HTTP surface.
 *
 * Asserts only externally observable properties of a deployed static bundle --
 * the things the Safe{Wallet} host actually checks before it will load an app,
 * plus the one build-time setting that is invisible to every other check:
 * which client gateway the bundle was compiled against.
 *
 * Rules implemented here trace to the host's own source, as documented in
 * tron-safe-app-research/INTEGRATION_GUIDE.md (protofire/tron-wallet-monorepo
 * @eb90af8):
 *   - manifest.json at the app root, validated as
 *     `name && description && (icons || iconPath)`   (manifest.ts:80-88)
 *   - manifest fetched cross-origin, so it needs CORS  (manifest.ts:58-78, §2)
 *   - manifest fetch aborts after 5000 ms              (manifest.ts:58,65-66)
 *   - query params stripped and trailing slash trimmed (manifest.ts:58-62,95-96)
 *   - icons[] wins over iconPath; relative paths resolve against the app URL
 *                                                      (manifest.ts:22-56)
 *   - the app runs in an iframe, so no X-Frame-Options and no frame-ancestors
 *     that excludes the embedding origin                (SafeAppIframe.tsx:44-53, §3)
 *
 * Usage:
 *   node scripts/verify_safe_app_deployment.mjs <app-url> [options]
 *
 * Options:
 *   --origin <url>           Embedding Safe UI origin to test framing/CORS
 *                            against. Default: https://tron-app.stage.safe.protofire.io
 *   --expect-gateway <url>   Assert this exact REACT_APP_GATEWAY_BASE_URL is
 *                            baked into the served JS bundle.
 *   --manifest-timeout <ms>  Manifest fetch budget. Default: 5000 (the host's).
 *   --allow-http             Permit a non-HTTPS app URL (local builds only).
 *   --json                   Emit the machine-readable report instead of text.
 *
 * Exit code: 0 if every check passed, 1 otherwise. Safe to gate CI on.
 */

const DEFAULT_SAFE_ORIGIN = 'https://tron-app.stage.safe.protofire.io'
const HOST_MANIFEST_TIMEOUT_MS = 5000

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested directly)
// ---------------------------------------------------------------------------

const isNonEmptyString = value => typeof value === 'string' && value.trim() !== ''

const stripTrailingSlash = url => (typeof url === 'string' ? url.replace(/\/+$/, '') : url)

/**
 * Mirrors the host's manifest validation, plus a stricter emptiness check:
 * the host accepts `name: ''` because it only tests key presence, but an empty
 * name renders as a blank app card, so we treat it as a failure.
 */
export function validateManifest(manifest) {
  const errors = []

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest is not a JSON object'] }
  }

  if (!isNonEmptyString(manifest.name)) {
    errors.push('missing or empty "name"')
  }

  if (!isNonEmptyString(manifest.description)) {
    errors.push('missing or empty "description"')
  }

  const hasIcons = Array.isArray(manifest.icons) && manifest.icons.length > 0
  const hasIconPath = isNonEmptyString(manifest.iconPath)
  if (!hasIcons && !hasIconPath) {
    errors.push('missing both "icons" and "iconPath" (the host requires one of them)')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * CORS has no wildcard-subdomain form: Access-Control-Allow-Origin is either
 * `*` or a single exact origin. `https://*.example.com` is never valid.
 */
export function isCorsAllowed(header, origin) {
  if (!isNonEmptyString(header)) {
    return false
  }

  const value = header.trim()
  if (value === '*') {
    return true
  }

  return stripTrailingSlash(value).toLowerCase() === stripTrailingSlash(origin).toLowerCase()
}

/**
 * CSP host-source matching, restricted to what frame-ancestors needs.
 * A leading `*.` is a suffix match on the host, per CSP3 host-part-match: it
 * matches any number of leading labels but never the bare parent domain.
 */
function cspSourceMatchesOrigin(source, originUrl) {
  const token = source.trim()
  if (token === '') {
    return false
  }
  if (token === '*') {
    return true
  }
  // Keyword sources ('self', 'none', 'unsafe-inline', ...) never name another host.
  if (token.startsWith("'")) {
    return false
  }

  let rest = token
  const schemeMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)
  if (schemeMatch) {
    if (schemeMatch[1].toLowerCase() !== originUrl.protocol.replace(':', '')) {
      return false
    }
    rest = rest.slice(schemeMatch[0].length)
  }

  // Drop any path and port portions -- only the host pattern matters here.
  const hostPattern = rest.split('/')[0].split(':')[0].toLowerCase()
  const host = originUrl.hostname.toLowerCase()

  if (hostPattern.startsWith('*.')) {
    return host.endsWith('.' + hostPattern.slice(2))
  }

  return hostPattern === host
}

/**
 * @param {{xFrameOptions: ?string, csp: ?string}} headers
 * @param {string} origin the embedding Safe UI origin
 */
export function checkFraming(headers, origin) {
  const { xFrameOptions, csp } = headers

  if (isNonEmptyString(xFrameOptions)) {
    return {
      ok: false,
      reason: `X-Frame-Options: ${xFrameOptions.trim()} blocks iframe embedding entirely`,
    }
  }

  if (!isNonEmptyString(csp)) {
    return { ok: true, reason: 'no framing-blocking headers' }
  }

  // A response may carry several CSP headers; fetch joins them with ", ".
  // Any one of them containing frame-ancestors constrains framing.
  const directives = csp
    .split(';')
    .map(d => d.trim())
    .filter(Boolean)

  const frameAncestors = directives.filter(d => /^frame-ancestors(\s|$)/i.test(d))

  if (frameAncestors.length === 0) {
    return { ok: true, reason: 'CSP present but has no frame-ancestors directive' }
  }

  const originUrl = new URL(origin)

  for (const directive of frameAncestors) {
    const sources = directive.split(/\s+/).slice(1)

    if (sources.length === 0 || sources.some(s => s.toLowerCase() === "'none'")) {
      return { ok: false, reason: `CSP frame-ancestors 'none' -- framing is forbidden` }
    }

    if (!sources.some(source => cspSourceMatchesOrigin(source, originUrl))) {
      return {
        ok: false,
        reason: `CSP frame-ancestors does not allow ${origin} (allows: ${sources.join(' ')})`,
      }
    }
  }

  return { ok: true, reason: `CSP frame-ancestors allows ${origin}` }
}

/**
 * Resolves the icon the host would actually load: icons[0] wins over iconPath,
 * absolute https URLs are used verbatim, everything else resolves against the
 * app URL.
 */
export function resolveIconUrl(manifest, appUrl) {
  if (manifest === null || typeof manifest !== 'object') {
    return null
  }

  const fromIcons =
    Array.isArray(manifest.icons) && manifest.icons.length > 0 ? manifest.icons[0]?.src : null
  const candidate = isNonEmptyString(fromIcons) ? fromIcons : manifest.iconPath

  if (!isNonEmptyString(candidate)) {
    return null
  }

  if (candidate.startsWith('https://')) {
    return candidate
  }

  return new URL(candidate, stripTrailingSlash(appUrl) + '/').toString()
}

/**
 * Recovers the value CRA inlined for REACT_APP_GATEWAY_BASE_URL at build time.
 *
 * Deliberately keyed on the variable name, so the unrelated
 * `DEFAULT_BASE_URL="https://safe-client.safe.global"` constant that
 * @safe-global/safe-gateway-typescript-sdk ships is never mistaken for the
 * app's configured gateway.
 */
export function extractBakedGatewayUrl(source) {
  const match = source.match(/REACT_APP_GATEWAY_BASE_URL\s*:\s*(['"])(.*?)\1/)
  return match ? match[2] : null
}

// ---------------------------------------------------------------------------
// HTTP surface verification
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    return { response }
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return {
      error: timedOut
        ? `request timed out after ${timeoutMs} ms`
        : `request failed: ${error?.message ?? error}`,
    }
  }
}

/**
 * @param {string} rawAppUrl
 * @param {{origin?: string, expectGateway?: string, manifestTimeoutMs?: number,
 *          allowHttp?: boolean}} options
 */
export async function verifyDeployment(rawAppUrl, options = {}) {
  const {
    origin = DEFAULT_SAFE_ORIGIN,
    expectGateway = null,
    manifestTimeoutMs = HOST_MANIFEST_TIMEOUT_MS,
    allowHttp = false,
  } = options

  // The host strips query params and trims the trailing slash before deriving
  // the manifest URL and the key it registers the app under, so verify exactly
  // the URL it will use -- not whatever the operator pasted.
  const parsed = new URL(rawAppUrl)
  parsed.search = ''
  parsed.hash = ''
  const appUrl = stripTrailingSlash(parsed.toString())

  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok, detail })

  // --- https -------------------------------------------------------------
  const isHttps = parsed.protocol === 'https:'
  if (isHttps) {
    add('https', true, 'served over HTTPS')
  } else if (allowHttp) {
    add('https', true, `not HTTPS, permitted by --allow-http (${parsed.protocol}//)`)
  } else {
    add(
      'https',
      false,
      `app URL must be https:// -- an HTTPS Safe UI cannot frame ${parsed.protocol}// content`,
    )
  }

  // --- root reachability + framing headers -------------------------------
  const rootResult = await fetchWithTimeout(appUrl, manifestTimeoutMs)
  let rootBody = null

  if (rootResult.error) {
    add('root', false, rootResult.error)
    add('framing', false, 'could not read framing headers (app root unreachable)')
  } else {
    const { response } = rootResult
    add(
      'root',
      response.status === 200,
      response.status === 200 ? 'HTTP 200' : `HTTP ${response.status} (expected 200)`,
    )

    const framing = checkFraming(
      {
        xFrameOptions: response.headers.get('x-frame-options'),
        csp: response.headers.get('content-security-policy'),
      },
      origin,
    )
    add('framing', framing.ok, framing.reason)

    try {
      rootBody = await response.text()
    } catch {
      rootBody = null
    }
  }

  // --- manifest ----------------------------------------------------------
  const manifestUrl = `${appUrl}/manifest.json`
  // Send Origin, exactly as the browser's cross-origin fetch() does. CORS
  // implementations are entitled to answer conditionally on it (S3/CloudFront
  // does, and advertises `vary: Origin`), so a probe without it under-reports
  // CORS support.
  const manifestResult = await fetchWithTimeout(manifestUrl, manifestTimeoutMs, {
    headers: { Origin: origin },
  })
  let manifest = null

  if (manifestResult.error) {
    add('manifest', false, `${manifestUrl}: ${manifestResult.error}`)
    add('manifest-cors', false, 'could not read CORS headers (manifest unreachable)')
  } else {
    const { response } = manifestResult

    if (response.status !== 200) {
      add('manifest', false, `HTTP ${response.status} at ${manifestUrl} (expected 200)`)
    } else {
      const raw = await response.text()
      let parsedManifest
      try {
        parsedManifest = JSON.parse(raw)
      } catch (error) {
        parsedManifest = undefined
        add('manifest', false, `not valid JSON: ${error.message}`)
      }

      if (parsedManifest !== undefined) {
        const validation = validateManifest(parsedManifest)
        if (validation.ok) {
          manifest = parsedManifest
          add('manifest', true, `valid: name="${parsedManifest.name}"`)
        } else {
          // Keep the parsed manifest for the icon check where possible -- a
          // manifest can be missing a description yet still name a real icon.
          manifest = parsedManifest
          add('manifest', false, validation.errors.join('; '))
        }
      }
    }

    const acao = response.headers.get('access-control-allow-origin')
    add(
      'manifest-cors',
      isCorsAllowed(acao, origin),
      acao
        ? `Access-Control-Allow-Origin: ${acao}`
        : `no Access-Control-Allow-Origin -- the add-custom-app dialog will report "The app doesn't support Safe App functionality"`,
    )
  }

  // --- icon --------------------------------------------------------------
  const iconUrl = manifest ? resolveIconUrl(manifest, appUrl) : null
  if (iconUrl) {
    const iconResult = await fetchWithTimeout(iconUrl, manifestTimeoutMs)
    if (iconResult.error) {
      add('icon', false, `${iconUrl}: ${iconResult.error}`)
    } else {
      add(
        'icon',
        iconResult.response.status === 200,
        `${iconUrl} -> HTTP ${iconResult.response.status}`,
      )
    }
  }

  // --- baked gateway base URL -------------------------------------------
  if (expectGateway) {
    add(...(await checkBakedGateway(appUrl, rootBody, expectGateway, manifestTimeoutMs)))
  }

  return { appUrl, origin, ok: checks.every(c => c.ok), checks }
}

/**
 * Downloads the scripts the app root references and compares the gateway URL
 * compiled into them against the expected one.
 *
 * This is the check that catches an otherwise invisible misbuild: a bundle
 * pointed at a gateway that does not serve the target chain looks perfectly
 * healthy to every manifest, CORS and framing probe, but its ABI lookup can
 * never succeed.
 */
async function checkBakedGateway(appUrl, rootBody, expectGateway, timeoutMs) {
  if (rootBody === null) {
    return ['gateway', false, 'could not read the app root, so no bundle could be inspected']
  }

  const srcs = [...rootBody.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
  if (srcs.length === 0) {
    return ['gateway', false, 'no <script src> found in the app root HTML']
  }

  const expected = stripTrailingSlash(expectGateway)
  const seen = []

  for (const src of srcs) {
    const url = new URL(src, stripTrailingSlash(appUrl) + '/').toString()
    const result = await fetchWithTimeout(url, timeoutMs)
    if (result.error || result.response.status !== 200) {
      continue
    }

    const found = extractBakedGatewayUrl(await result.response.text())
    if (found === null) {
      continue
    }

    seen.push(found)
    if (stripTrailingSlash(found) === expected) {
      return ['gateway', true, `bundle is built against ${found}`]
    }
  }

  if (seen.length === 0) {
    return [
      'gateway',
      false,
      `no REACT_APP_GATEWAY_BASE_URL is baked into the bundle (expected ${expected}) -- the app was built with the variable unset`,
    ]
  }

  return [
    'gateway',
    false,
    `bundle is built against ${seen.join(', ')} but ${expected} was expected`,
  ]
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {}
  let appUrl = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--origin':
        options.origin = argv[++i]
        break
      case '--expect-gateway':
        options.expectGateway = argv[++i]
        break
      case '--manifest-timeout':
        options.manifestTimeoutMs = Number(argv[++i])
        break
      case '--allow-http':
        options.allowHttp = true
        break
      case '--json':
        options.json = true
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`unknown option: ${arg}`)
        }
        appUrl = arg
    }
  }

  return { appUrl, options }
}

async function main(argv) {
  let appUrl, options
  try {
    ;({ appUrl, options } = parseArgs(argv))
  } catch (error) {
    console.error(error.message)
    return 2
  }

  if (!appUrl) {
    console.error(
      'usage: node scripts/verify_safe_app_deployment.mjs <app-url> [--origin <url>]\n' +
        '       [--expect-gateway <url>] [--manifest-timeout <ms>] [--allow-http] [--json]',
    )
    return 2
  }

  const { json, ...verifyOptions } = options
  const report = await verifyDeployment(appUrl, verifyOptions)

  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Safe App deployment check: ${report.appUrl}`)
    console.log(`Embedding origin:          ${report.origin}\n`)
    for (const check of report.checks) {
      console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(14)} ${check.detail}`)
    }
    const failed = report.checks.filter(c => !c.ok).length
    console.log(`\n${report.ok ? 'All checks passed.' : `${failed} check(s) failed.`}`)
  }

  return report.ok ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main(process.argv.slice(2)))
}
