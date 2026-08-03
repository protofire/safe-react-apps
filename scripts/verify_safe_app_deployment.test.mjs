import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import {
  validateManifest,
  isCorsAllowed,
  checkFraming,
  resolveIconUrl,
  extractBakedGatewayUrl,
  verifyDeployment,
} from './verify_safe_app_deployment.mjs'

const SAFE_ORIGIN = 'https://tron-app.stage.safe.protofire.io'

// ---------------------------------------------------------------------------
// validateManifest
//
// The host's validation is exactly (manifest.ts:80-88 @eb90af8):
//   json != null && typeof json === 'object' &&
//   'name' in json && 'description' in json && ('icons' in json || 'iconPath' in json)
// ---------------------------------------------------------------------------
describe('validateManifest', () => {
  test('accepts a manifest with name, description and iconPath', () => {
    const result = validateManifest({
      name: 'Transaction Builder',
      description: 'Compose custom contract interactions',
      iconPath: 'tx-builder.png',
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.errors, [])
  })

  test('accepts a manifest with icons[] instead of iconPath', () => {
    const result = validateManifest({
      name: 'Transaction Builder',
      description: 'Compose custom contract interactions',
      icons: [{ src: 'tx-builder.png', sizes: '256x256', type: 'image/png' }],
    })
    assert.equal(result.ok, true)
  })

  test('rejects a stock CRA PWA manifest (no description)', () => {
    const result = validateManifest({
      short_name: 'App',
      name: 'App',
      icons: [{ src: 'favicon.ico' }],
      start_url: '.',
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(e => /description/.test(e)))
  })

  test('rejects a manifest with neither icons nor iconPath', () => {
    const result = validateManifest({ name: 'App', description: 'does things' })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(e => /icons.*iconPath|iconPath.*icons/.test(e)))
  })

  test('rejects empty-string name and description', () => {
    const result = validateManifest({ name: '', description: '  ', iconPath: 'i.png' })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(e => /name/.test(e)))
    assert.ok(result.errors.some(e => /description/.test(e)))
  })

  test('rejects non-objects', () => {
    for (const bad of [null, undefined, 'a string', 42, []]) {
      assert.equal(validateManifest(bad).ok, false, `should reject ${JSON.stringify(bad)}`)
    }
  })

  test('rejects an empty icons array with no iconPath', () => {
    const result = validateManifest({ name: 'App', description: 'does things', icons: [] })
    assert.equal(result.ok, false)
  })
})

// ---------------------------------------------------------------------------
// isCorsAllowed
//
// The manifest is fetched cross-origin from the Safe UI's origin, so the
// response needs Access-Control-Allow-Origin (INTEGRATION_GUIDE.md §2).
// ---------------------------------------------------------------------------
describe('isCorsAllowed', () => {
  test('accepts a wildcard', () => {
    assert.equal(isCorsAllowed('*', SAFE_ORIGIN), true)
  })

  test('accepts an exact origin echo', () => {
    assert.equal(isCorsAllowed(SAFE_ORIGIN, SAFE_ORIGIN), true)
  })

  test('accepts an exact origin echo with a trailing slash', () => {
    assert.equal(isCorsAllowed(SAFE_ORIGIN + '/', SAFE_ORIGIN), true)
  })

  test('rejects a missing header', () => {
    assert.equal(isCorsAllowed(null, SAFE_ORIGIN), false)
    assert.equal(isCorsAllowed(undefined, SAFE_ORIGIN), false)
    assert.equal(isCorsAllowed('', SAFE_ORIGIN), false)
  })

  test('rejects a different origin', () => {
    assert.equal(isCorsAllowed('https://app.safe.global', SAFE_ORIGIN), false)
  })

  test('does not treat a CORS wildcard subdomain as valid (not a CORS feature)', () => {
    assert.equal(isCorsAllowed('https://*.safe.protofire.io', SAFE_ORIGIN), false)
  })
})

// ---------------------------------------------------------------------------
// checkFraming
//
// Safe Apps load in an iframe. The app must not send X-Frame-Options, and any
// CSP frame-ancestors it does send must include the embedding origin
// (INTEGRATION_GUIDE.md §3). Round 1 found 15/50 candidate apps unframable
// for exactly this reason.
// ---------------------------------------------------------------------------
describe('checkFraming', () => {
  test('passes when no framing headers are present', () => {
    const result = checkFraming({ xFrameOptions: null, csp: null }, SAFE_ORIGIN)
    assert.equal(result.ok, true)
  })

  test('fails on X-Frame-Options: DENY', () => {
    const result = checkFraming({ xFrameOptions: 'DENY', csp: null }, SAFE_ORIGIN)
    assert.equal(result.ok, false)
    assert.match(result.reason, /X-Frame-Options/i)
  })

  test('fails on X-Frame-Options: SAMEORIGIN (any casing)', () => {
    assert.equal(checkFraming({ xFrameOptions: 'sameorigin', csp: null }, SAFE_ORIGIN).ok, false)
  })

  test('passes when the CSP has no frame-ancestors directive', () => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'"
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, true)
  })

  test("fails on frame-ancestors 'none'", () => {
    const result = checkFraming({ xFrameOptions: null, csp: "frame-ancestors 'none'" }, SAFE_ORIGIN)
    assert.equal(result.ok, false)
    assert.match(result.reason, /frame-ancestors/i)
  })

  test("fails on frame-ancestors 'self' (the embedding origin is a different host)", () => {
    assert.equal(
      checkFraming({ xFrameOptions: null, csp: "frame-ancestors 'self'" }, SAFE_ORIGIN).ok,
      false,
    )
  })

  test('passes when frame-ancestors names the embedding origin exactly', () => {
    const csp = `frame-ancestors 'self' ${SAFE_ORIGIN}`
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, true)
  })

  test('passes on a host wildcard that suffix-matches the embedding host', () => {
    const csp = 'frame-ancestors https://*.safe.protofire.io'
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, true)
  })

  test('fails on a host wildcard for a different domain (the safe.global trap)', () => {
    const csp = 'frame-ancestors https://*.safe.global https://app.safe.global'
    const result = checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN)
    assert.equal(result.ok, false)
    assert.match(result.reason, /safe\.global/)
  })

  test('passes on a bare * source', () => {
    assert.equal(
      checkFraming({ xFrameOptions: null, csp: 'frame-ancestors *' }, SAFE_ORIGIN).ok,
      true,
    )
  })

  test('passes on a scheme-less host source', () => {
    const csp = 'frame-ancestors tron-app.stage.safe.protofire.io'
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, true)
  })

  test('does not let a wildcard match a bare parent domain it should not', () => {
    // '*.stage.safe.protofire.io' must not match 'stage.safe.protofire.io' itself
    const csp = 'frame-ancestors https://*.tron-app.stage.safe.protofire.io'
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, false)
  })

  test('reads frame-ancestors from a multi-directive CSP regardless of position', () => {
    const csp = `default-src 'self'; frame-ancestors ${SAFE_ORIGIN}; img-src *`
    assert.equal(checkFraming({ xFrameOptions: null, csp }, SAFE_ORIGIN).ok, true)
  })
})

// ---------------------------------------------------------------------------
// resolveIconUrl
//
// icons[] wins over iconPath; relative paths resolve against the app URL;
// only values starting with https:// are used verbatim (manifest.ts:22-56).
// ---------------------------------------------------------------------------
describe('resolveIconUrl', () => {
  const appUrl = 'https://apps.example.com/tx-builder'

  test('resolves iconPath relative to the app URL', () => {
    assert.equal(
      resolveIconUrl({ iconPath: 'tx-builder.png' }, appUrl),
      'https://apps.example.com/tx-builder/tx-builder.png',
    )
  })

  test('prefers icons[] over iconPath', () => {
    const manifest = { iconPath: 'old.png', icons: [{ src: 'new.svg', sizes: 'any' }] }
    assert.equal(resolveIconUrl(manifest, appUrl), 'https://apps.example.com/tx-builder/new.svg')
  })

  test('uses an absolute https icon verbatim', () => {
    const manifest = { icons: [{ src: 'https://cdn.example.com/i.png' }] }
    assert.equal(resolveIconUrl(manifest, appUrl), 'https://cdn.example.com/i.png')
  })

  test('returns null when there is no icon to resolve', () => {
    assert.equal(resolveIconUrl({ name: 'x', description: 'y' }, appUrl), null)
    assert.equal(resolveIconUrl({ icons: [] }, appUrl), null)
  })
})

// ---------------------------------------------------------------------------
// extractBakedGatewayUrl
//
// This is the check that catches the failure actually observed in production:
// the Transaction Builder registered on the Tron gateway on 2026-08-03 was
// built with REACT_APP_GATEWAY_BASE_URL="https://gateway-registry.safe.protofire.io",
// which 404s for chain 2494104990 -- so its ABI lookup can never work, and
// nothing about the manifest or framing reveals that.
// ---------------------------------------------------------------------------
describe('extractBakedGatewayUrl', () => {
  test('extracts the value CRA inlines into the bundle', () => {
    const js =
      'REACT_APP_FOO:"bar",REACT_APP_GATEWAY_BASE_URL:"https://gateway-tron.stage.safe.protofire.io",REACT_APP_BAZ:"1"'
    assert.equal(extractBakedGatewayUrl(js), 'https://gateway-tron.stage.safe.protofire.io')
  })

  test('handles single quotes and whitespace around the colon', () => {
    const js = "REACT_APP_GATEWAY_BASE_URL : 'https://gw.example.com'"
    assert.equal(extractBakedGatewayUrl(js), 'https://gw.example.com')
  })

  test('handles the direct process.env member-expression form', () => {
    const js = 'var x=process.env.REACT_APP_GATEWAY_BASE_URL'
    assert.equal(extractBakedGatewayUrl(js), null)
  })

  test('returns null when the variable is absent', () => {
    assert.equal(extractBakedGatewayUrl('console.log("hello")'), null)
  })

  test('ignores the SDK DEFAULT_BASE_URL constant', () => {
    // @safe-global/safe-gateway-typescript-sdk ships this literal; it is not
    // the app's configured gateway and must not be mistaken for it.
    const js = 't.DEFAULT_BASE_URL="https://safe-client.safe.global"'
    assert.equal(extractBakedGatewayUrl(js), null)
  })
})

// ---------------------------------------------------------------------------
// verifyDeployment -- end-to-end against a local fixture server
// ---------------------------------------------------------------------------

/**
 * Spins up a fixture static host. `overrides` lets each test bend exactly one
 * aspect of a known-good deployment.
 */
function startFixture(overrides = {}) {
  const {
    manifest = {
      name: 'Transaction Builder',
      description: 'Compose custom contract interactions and batch them into a single transaction',
      iconPath: 'tx-builder.png',
    },
    manifestRaw = null,
    manifestStatus = 200,
    cors = '*',
    xFrameOptions = null,
    csp = null,
    iconStatus = 200,
    rootStatus = 200,
    manifestDelayMs = 0,
    gatewayUrl = 'https://gateway-tron.stage.safe.protofire.io',
    bundlePath = '/static/js/main.abc123.js',
    bundleStatus = 200,
    // S3/CloudFront (and every spec-compliant CORS implementation) only emits
    // Access-Control-Allow-Origin when the request actually carries an Origin
    // header, and advertises that with `vary: Origin`.
    corsRequiresOriginHeader = false,
  } = overrides

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const framing = {}
    if (xFrameOptions) framing['X-Frame-Options'] = xFrameOptions
    if (csp) framing['Content-Security-Policy'] = csp

    if (url.pathname === '/app/manifest.json') {
      if (manifestDelayMs) await new Promise(r => setTimeout(r, manifestDelayMs))
      const headers = { 'Content-Type': 'application/json' }
      const originAware = !corsRequiresOriginHeader || Boolean(req.headers.origin)
      if (cors && originAware) {
        headers['Access-Control-Allow-Origin'] = cors
        headers['Vary'] = 'Origin'
      }
      res.writeHead(manifestStatus, headers)
      res.end(manifestRaw !== null ? manifestRaw : JSON.stringify(manifest))
      return
    }

    if (url.pathname === '/app/tx-builder.png') {
      res.writeHead(iconStatus, { 'Content-Type': 'image/png', ...framing })
      res.end('PNG')
      return
    }

    if (url.pathname === '/app' || url.pathname === '/app/') {
      res.writeHead(rootStatus, { 'Content-Type': 'text/html', ...framing })
      res.end(`<!doctype html><html><body><script src="/app${bundlePath}"></script></body></html>`)
      return
    }

    if (url.pathname === `/app${bundlePath}`) {
      res.writeHead(bundleStatus, { 'Content-Type': 'application/javascript', ...framing })
      res.end(
        gatewayUrl
          ? `var e={REACT_APP_GATEWAY_BASE_URL:"${gatewayUrl}"};t.DEFAULT_BASE_URL="https://safe-client.safe.global"`
          : 'var e={}',
      )
      return
    }

    res.writeHead(404, framing)
    res.end('not found')
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        server,
        url: `http://127.0.0.1:${port}/app`,
        close: () => new Promise(r => server.close(r)),
      })
    })
  })
}

const baseOpts = { origin: SAFE_ORIGIN, allowHttp: true }

function checkNamed(report, name) {
  const check = report.checks.find(c => c.name === name)
  assert.ok(
    check,
    `expected a "${name}" check in the report, got: ${report.checks.map(c => c.name)}`,
  )
  return check
}

describe('verifyDeployment', () => {
  test('passes a correctly configured deployment', async () => {
    const fx = await startFixture()
    try {
      const report = await verifyDeployment(fx.url, {
        ...baseOpts,
        expectGateway: 'https://gateway-tron.stage.safe.protofire.io',
      })
      assert.equal(
        report.ok,
        true,
        `expected pass, failures: ${JSON.stringify(report.checks.filter(c => !c.ok))}`,
      )
      for (const name of ['root', 'manifest', 'manifest-cors', 'framing', 'icon', 'gateway']) {
        assert.equal(checkNamed(report, name).ok, true, `${name} should pass`)
      }
    } finally {
      await fx.close()
    }
  })

  test('fails when the app root is unreachable', async () => {
    const fx = await startFixture({ rootStatus: 404 })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.equal(checkNamed(report, 'root').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest is missing', async () => {
    const fx = await startFixture({ manifestStatus: 404 })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.equal(checkNamed(report, 'manifest').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest is not valid JSON', async () => {
    const fx = await startFixture({ manifestRaw: '<html>nope</html>' })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      const check = checkNamed(report, 'manifest')
      assert.equal(check.ok, false)
      assert.match(check.detail, /JSON/i)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest lacks a description', async () => {
    const fx = await startFixture({ manifest: { name: 'App', iconPath: 'tx-builder.png' } })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.match(checkNamed(report, 'manifest').detail, /description/)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest has no CORS header', async () => {
    const fx = await startFixture({ cors: null })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.equal(checkNamed(report, 'manifest-cors').ok, false)
      // The manifest itself is still structurally valid -- the two must not be conflated.
      assert.equal(checkNamed(report, 'manifest').ok, true)
    } finally {
      await fx.close()
    }
  })

  test('sends an Origin header, so origin-conditional CORS is not a false failure', async () => {
    // Regression: the first run against the real S3/CloudFront deployment
    // reported "no Access-Control-Allow-Origin" because the probe fetched the
    // manifest without an Origin header. The bucket does serve CORS -- but,
    // correctly, only to requests that declare an origin (`vary: Origin`).
    // A browser always sends one, so a probe that does not is measuring the
    // wrong thing.
    const fx = await startFixture({ corsRequiresOriginHeader: true })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(checkNamed(report, 'manifest-cors').ok, true)
      assert.equal(report.ok, true)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest CORS header names a different origin', async () => {
    const fx = await startFixture({ cors: 'https://app.safe.global' })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(checkNamed(report, 'manifest-cors').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when the app sends X-Frame-Options', async () => {
    const fx = await startFixture({ xFrameOptions: 'SAMEORIGIN' })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.equal(checkNamed(report, 'framing').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when CSP frame-ancestors excludes the Safe origin', async () => {
    const fx = await startFixture({ csp: "frame-ancestors 'self' https://app.safe.global" })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(checkNamed(report, 'framing').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest icon 404s', async () => {
    const fx = await startFixture({ iconStatus: 404 })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, false)
      assert.equal(checkNamed(report, 'icon').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('fails when the manifest exceeds the host 5s fetch timeout', async () => {
    const fx = await startFixture({ manifestDelayMs: 300 })
    try {
      const report = await verifyDeployment(fx.url, { ...baseOpts, manifestTimeoutMs: 50 })
      assert.equal(report.ok, false)
      const check = checkNamed(report, 'manifest')
      assert.equal(check.ok, false)
      assert.match(check.detail, /timed out|timeout/i)
    } finally {
      await fx.close()
    }
  })

  test('fails when the baked gateway URL is not the expected one', async () => {
    // Exactly the production defect found on 2026-08-03.
    const fx = await startFixture({ gatewayUrl: 'https://gateway-registry.safe.protofire.io' })
    try {
      const report = await verifyDeployment(fx.url, {
        ...baseOpts,
        expectGateway: 'https://gateway-tron.stage.safe.protofire.io',
      })
      assert.equal(report.ok, false)
      const check = checkNamed(report, 'gateway')
      assert.equal(check.ok, false)
      assert.match(check.detail, /gateway-registry\.safe\.protofire\.io/)
    } finally {
      await fx.close()
    }
  })

  test('fails when no gateway URL is baked in at all', async () => {
    const fx = await startFixture({ gatewayUrl: null })
    try {
      const report = await verifyDeployment(fx.url, {
        ...baseOpts,
        expectGateway: 'https://gateway-tron.stage.safe.protofire.io',
      })
      assert.equal(checkNamed(report, 'gateway').ok, false)
    } finally {
      await fx.close()
    }
  })

  test('tolerates a trailing slash difference in the expected gateway URL', async () => {
    const fx = await startFixture({ gatewayUrl: 'https://gateway-tron.stage.safe.protofire.io' })
    try {
      const report = await verifyDeployment(fx.url, {
        ...baseOpts,
        expectGateway: 'https://gateway-tron.stage.safe.protofire.io/',
      })
      assert.equal(checkNamed(report, 'gateway').ok, true)
    } finally {
      await fx.close()
    }
  })

  test('skips the gateway check when no expectation is given', async () => {
    const fx = await startFixture({ gatewayUrl: 'https://whatever.example.com' })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      assert.equal(report.ok, true)
      assert.equal(
        report.checks.some(c => c.name === 'gateway'),
        false,
        'gateway check should be absent when --expect-gateway is not passed',
      )
    } finally {
      await fx.close()
    }
  })

  test('flags a non-HTTPS app URL unless allowHttp is set', async () => {
    const fx = await startFixture()
    try {
      const report = await verifyDeployment(fx.url, { origin: SAFE_ORIGIN })
      assert.equal(report.ok, false)
      const check = checkNamed(report, 'https')
      assert.equal(check.ok, false)
      assert.match(check.detail, /https/i)
    } finally {
      await fx.close()
    }
  })

  test('reports every failure rather than stopping at the first', async () => {
    const fx = await startFixture({
      cors: null,
      xFrameOptions: 'DENY',
      iconStatus: 500,
    })
    try {
      const report = await verifyDeployment(fx.url, baseOpts)
      const failed = report.checks
        .filter(c => !c.ok)
        .map(c => c.name)
        .sort()
      assert.deepEqual(failed, ['framing', 'icon', 'manifest-cors'])
    } finally {
      await fx.close()
    }
  })

  test('is reported against the query-stripped, slash-trimmed app URL the host registers', async () => {
    // manifest.ts:58-62,95-96 -- the host strips query params and trims the
    // trailing slash before appending /manifest.json.
    const fx = await startFixture()
    try {
      const report = await verifyDeployment(fx.url + '/?foo=bar', baseOpts)
      assert.equal(report.ok, true)
      assert.equal(report.appUrl, fx.url)
    } finally {
      await fx.close()
    }
  })
})
