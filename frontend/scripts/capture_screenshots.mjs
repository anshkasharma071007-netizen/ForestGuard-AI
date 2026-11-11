// Captures the ten documentation screenshots from the running local app.
// Usage: node scripts/capture_screenshots.mjs
// Requires the backend on :8000, the Vite dev server on :5173, and Microsoft Edge.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:5173'
const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../docs/screenshots')
const PROJECT = path.resolve(here, '../..')

fs.mkdirSync(OUT, { recursive: true })

const mapsOnly = process.argv.includes('--maps-only')
const errors = []

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
})
const page = await context.newPage()
page.setDefaultTimeout(120000)

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

const settle = async (ms = 1400) => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
  await page.mouse.move(720, 10)
}

const waitForMap = async () => {
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 60000 })
  await page.waitForFunction(
    () => {
      const tiles = document.querySelectorAll('.leaflet-tile')
      const loaded = document.querySelectorAll('.leaflet-tile-loaded')
      return tiles.length > 0 && loaded.length === tiles.length
    },
    null,
    { timeout: 60000 },
  )
  await page.waitForTimeout(2000)
}

const open = async (route, { loader } = {}) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await settle()
  if (loader) await loader()
}

const shot = async (name) => {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file })
  console.log(`captured ${name}`)
}

const shotAt = async (name, locator, offset = 96) => {
  await locator.first().scrollIntoViewIfNeeded()
  await page.evaluate((value) => window.scrollBy(0, -value), offset)
  await page.waitForTimeout(700)
  await shot(name)
}

// --- sign in as the range officer -----------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('#email', 'admin@forestguard.ai')
await page.fill('#password', 'forest123')
await page.getByRole('button', { name: 'Enter operations console' }).click()
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 })
await page.waitForSelector('text=Range intelligence, at a glance')
await settle(2200)

// --- live monitoring: genuine upload + inference ---------------------------
if (!mapsOnly) {
  await open('/monitoring')
  await page.setInputFiles('input[type=file]', path.join(PROJECT, 'demo_data/wildlife_images/tiger.jpg'))
  await page.waitForSelector('text=Run AI analysis')
  await page.waitForFunction(() => document.querySelectorAll('#camera option').length > 1)
  await page.selectOption('#camera', { index: 1 })
  await page.fill('#notes', 'Buffer track · night capture')
  await page.getByRole('button', { name: 'Run AI analysis' }).click()
  console.log('inference started; waiting for the analysis panel…')
  await page.waitForSelector('text=Analysis complete', { timeout: 480000 })
  await settle(1200)
  await shotAt(
    '02_live_monitoring.png',
    page.locator('section').filter({ hasText: 'Analysis complete' }),
    8,
  )

  // --- overview ------------------------------------------------------------
  await open('/')
  await settle(2000)
  await shot('01_overview_dashboard.png')
}

// --- GIS intelligence map --------------------------------------------------
await open('/map', { loader: waitForMap })
await shotAt('03_gis_intelligence_map.png', page.locator('.leaflet-container'), 150)

// --- wildlife intelligence -------------------------------------------------
if (!mapsOnly) {
  await open('/wildlife')
  await settle(2000)
  await shot('04_wildlife_intelligence.png')
}

// --- risk & alerts ---------------------------------------------------------
await open('/risk', { loader: waitForMap })
await shot('05_risk_alerts.png')

// --- forest guard panel ----------------------------------------------------
await open('/guard', { loader: waitForMap })
await shot('06_forest_guard_panel.png')

// --- community portal ------------------------------------------------------
if (!mapsOnly) {
await open('/community')
await page.waitForSelector('text=Report a sighting or conflict')
await settle(1500)
await shot('07_community_portal.png')

await page.locator('#report').scrollIntoViewIfNeeded()
await page.evaluate(() => window.scrollBy(0, -80))
await page.getByRole('button', { name: 'Wildlife sighting' }).click()
await page.selectOption('#report-species', 'leopard')
await page.waitForFunction(() => document.querySelectorAll('#report-village option').length > 1)
await page.selectOption('#report-village', { index: 1 })
await page.fill(
  '#report-description',
  'Leopard seen at dusk near the cattle shed on the eastern edge of the village. It moved back towards the buffer forest without approaching people.',
)
await page.fill('#report-name', 'Sunita Uikey')
await page.getByRole('button', { name: 'Submit report' }).click()
await page.waitForSelector('text=Report received')
const reference = (await page.locator('text=/FG-\\d{4}-\\d{4}/').first().innerText()).trim()
console.log(`community report reference: ${reference}`)
await page.getByLabel('Report reference code').fill(reference)
await page.getByRole('button', { name: 'Check', exact: true }).click()
await page.waitForTimeout(1200)
await shotAt('08_community_report_status.png', page.locator('#report'), 70)

// --- analytics -------------------------------------------------------------
await open('/analytics')
await settle(2200)
await shot('09_analytics_trends.png')
await shotAt(
  '10_analytics_reports.png',
  page.locator('section').filter({ hasText: 'Operational snapshot' }),
  80,
)
}

await browser.close()

if (errors.length) {
  console.log('--- browser errors ---')
  errors.forEach((error) => console.log(error))
  process.exitCode = 1
} else {
  console.log('no browser errors captured')
}
