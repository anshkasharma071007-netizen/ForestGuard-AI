// Rasterises the hand-authored SVG diagrams for the report and slide deck.
// Usage: node scripts/render_diagrams.mjs

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const here = path.dirname(fileURLToPath(import.meta.url))
const diagrams = path.resolve(here, '../../docs/diagrams')

const items = [
  ['system_architecture.svg', 1600, 900],
  ['data_pipeline.svg', 1600, 900],
  ['risk_model.svg', 1600, 860],
]

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const context = await browser.newContext({ deviceScaleFactor: 2 })

for (const [file, width, height] of items) {
  const page = await context.newPage()
  await page.setViewportSize({ width, height })
  await page.goto(pathToFileURL(path.join(diagrams, file)).href, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  const svg = page.locator('svg')
  await svg.screenshot({ path: path.join(diagrams, file.replace('.svg', '.png')) })
  console.log(`rendered ${file}`)
  await page.close()
}

await browser.close()
