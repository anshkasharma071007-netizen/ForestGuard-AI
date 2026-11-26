/** Invoked by backend.tests.report_workflow with an isolated API and fresh mobile web export. */
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync(brave) ? brave : undefined),
})
const mobile = await browser.newPage({ viewport: { width: 430, height: 900 } })
const official = await browser.newPage()
for (const page of [mobile, official]) {
  page.setDefaultTimeout(20000)
  page.on('pageerror', e => console.error(e.message))
}
try {
  await official.goto('http://127.0.0.1:18765/reports', { waitUntil: 'domcontentloaded' })
  await official.locator('input[type=email]').fill('reviewer@example.invalid')
  await official.locator('input[type=password]').fill(process.env.WORKFLOW_PASSWORD)
  await official.getByRole('button', { name: 'Sign in' }).click()
  await official.getByRole('link', { name: /Incident Reports/i }).first().click()
  await mobile.goto('http://127.0.0.1:18766/')
  await mobile.getByLabel('Area: Select a village').click()
  await mobile.getByRole('radio', { name: /Workflow village/ }).click()
  await mobile.getByText('Report an incident', { exact: true }).click()
  await mobile.getByText('Submit report', { exact: true }).click()
  await mobile.getByText('Enter your name before submitting.').waitFor()
  await mobile.getByLabel('Reporter name').fill('Browser observer')
  await mobile.getByLabel('Description', { exact: true }).fill('Elephant seen near the settlement')
  await mobile.getByLabel(/^Species:/).click()
  await mobile.getByRole('radio', { name: /elephant/i }).click()
  await mobile.getByText('Choose village', { exact: true }).click()
  await mobile.getByRole('radio', { name: /Workflow village/ }).click()
  const choosing = mobile.waitForEvent('filechooser')
  await mobile.getByText('Gallery', { exact: true }).click()
  await (await choosing).setFiles('frontend/public/images/elephant.jpg')
  await mobile.getByText('Photo attached').waitFor()
  await mobile.getByText('Submit report', { exact: true }).click()
  await mobile.getByText(/Could not reach Forest Guard/).waitFor()
  await mobile.getByText('Submit report', { exact: true }).click()
  await mobile.getByText('Report received', { exact: true }).waitFor()
  const original = await mobile.getByText(/^FG-[A-F0-9]{24}$/).innerText()
  assert.ok(original)
  await mobile.getByText('View report history').click()
  await mobile.getByText(original, { exact: true }).waitFor()
  await official.getByText(original, { exact: true }).first().click()
  await official.getByRole('img', { name: 'Submitted field evidence' }).waitFor()
  await official.getByText(/% confidence/).waitFor({ timeout: 120000 })
  await official.getByLabel('Review notes').fill('Confirmed in field')
  await official.getByRole('button', { name: 'Verify', exact: true }).click()
  await official.getByText('Confirmed in field', { exact: true }).waitFor()
  await mobile.getByText('Verified', { exact: true }).waitFor()
  await official.getByRole('button', { name: 'Close', exact: true }).click()
  await official.getByRole('link', { name: /New field alert/ }).click()
  await official.getByText('Verified report', { exact: true }).first().waitFor()
  await mobile.getByText('Alerts', { exact: true }).last().click()
  await mobile.getByText(/advisory: Asian elephant activity reported/).waitFor()
  console.log('Browser workflow passed, including lost-response retry and automatic status updates.')
} catch (err) {
  for (const page of [mobile, official]) console.error(page.url(), (await page.locator('body').innerText()).slice(-2200))
  throw err
} finally {
  await browser.close()
}
