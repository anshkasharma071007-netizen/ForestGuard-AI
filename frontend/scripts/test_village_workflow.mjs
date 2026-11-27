/** Run through python -m backend.tests.village_browser. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const { WORKFLOW_AUTHORITY: authority, WORKFLOW_MOBILE: mobile, WORKFLOW_PYTHON: python } = process.env
assert.ok(authority && mobile && python && process.env.WORKFLOW_TEST_DATABASE_URL)
const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync(brave) ? brave : undefined) })
const official = await browser.newPage()
const citizen = await browser.newPage({
  viewport: { width: 430, height: 900 }, geolocation: { latitude: 21.735, longitude: 79.35 }, permissions: ['geolocation'],
})
const button = (page, name) => page.getByRole('button', { name, exact: true })
const nav = official.getByRole('navigation', { name: 'Authority navigation' })
const villages = ['Anandpur', 'Vanpur', 'Haritgaon', 'Shantipur', 'Devgaon']
const villageOption = (page, name) => page.getByRole('radio', { name: new RegExp(name) })

async function signUp(page, name, phone) {
  await page.goto(mobile)
  await page.getByLabel('Full name', { exact: true }).fill(name)
  await page.getByLabel('Phone number', { exact: true }).fill(phone)
  await button(page, 'Continue').click()
  await page.getByLabel('Verification code').fill('1234')
  await button(page, 'Verify phone').click()
}

async function report(page, title, chooseLocation, other = false) {
  await button(page, 'New report').click()
  await page.getByLabel('Title (required)', { exact: true }).fill(title)
  await page.getByRole('radio', { name: 'Sighting', exact: true }).click()
  if (other) {
    await page.getByLabel(/^Animal:/).click()
    await page.getByRole('radio', { name: /^Other/ }).click()
    await page.getByLabel('Animal name (optional)').fill('Porcupine')
    const picker = page.waitForEvent('filechooser')
    await button(page, 'Gallery').click()
    await (await picker).setFiles('frontend/public/images/deer.jpg')
    await button(page, 'Expand submitted photograph').waitFor()
  }
  await chooseLocation()
  await button(page, 'Submit report').click()
  await page.getByText('Report submitted', { exact: true }).waitFor()
  const code = await page.getByText(/^FG-[A-F0-9]{24}$/).innerText()
  await page.getByRole('button', { name: 'View report', exact: true }).click()
  return code
}

async function review(title, location, id, manual = false) {
  await nav.getByRole('link', { name: /^Reports/ }).click()
  await official.getByRole('button', { name: new RegExp(title) }).click()
  const dialog = official.getByRole('dialog', { name: title }).or(
    official.locator('.fade-in').filter({ has: official.getByText(title, { exact: true }) }),
  )
  if (location) await dialog.getByText(location).waitFor()
  if (manual) {
    const analysis = dialog.getByRole('region', { name: 'AI analysis' })
    await analysis.getByText('Analysis unavailable', { exact: true }).waitFor()
    await button(analysis, 'Retry analysis').click()
    await analysis.getByText('Analysing image…', { exact: true }).waitFor()
    await dialog.getByRole('img', { name: 'Submitted incident evidence' }).waitFor()
    await dialog.getByText('Manual assessment required', { exact: true }).waitFor()
    assert.equal(await button(dialog, 'Approve report').isDisabled(), true)
    await dialog.getByLabel('Risk level').selectOption('low')
    await dialog.getByLabel('Assessment reason').fill('No contact or immediate threat reported.')
  } else {
    await dialog.getByLabel('Confirmed animal').selectOption('deer')
  }
  await dialog.getByRole('button', { name: 'Approve report', exact: true }).click()
  const approved = official.waitForResponse(response => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === `/api/reports/${id}`)
  await button(dialog, 'Confirm approval').click()
  const response = await approved
  assert.equal(response.status(), 200, await response.text())
  const approvedReport = (await response.json()).report
  assert.equal(approvedReport.lifecycle_status, 'under_work')
  await button(dialog, 'Close').click()
  return approvedReport
}

async function resolve(title) {
  await nav.getByRole('link', { name: 'Alerts', exact: true }).click()
  await official.getByRole('button', { name: new RegExp(title) }).click()
  await button(official, 'Resolve incident').click()
  await button(official, 'Confirm resolution').click()
  await official.getByText('Incident resolved.', { exact: true }).waitFor()
  await button(official, 'Close').click()
}

try {
  await official.goto(`${authority}/reports`)
  await official.locator('input[type=email]').fill('reviewer@example.invalid')
  await official.locator('input[type=password]').fill(process.env.WORKFLOW_PASSWORD)
  await button(official, 'Sign in').click()
  await nav.getByRole('link', { name: /^Reports/ }).waitFor()
  assert.deepEqual((await (await citizen.request.get(`${authority}/api/community/villages`)).json()).items, [])
  await signUp(citizen, 'GPS observer', '9876500145')
  const gps = async () => {
    await citizen.getByRole('radio', { name: 'Current location', exact: true }).click()
    await citizen.getByText('GPS location selected').waitFor()
  }
  await gps()
  await button(citizen, 'Save location and continue').click()
  await report(citizen, 'GPS only sighting', gps)
  const first = await review('GPS only sighting', null, 1)
  assert.equal(first.risk.distance_km, null)
  await citizen.getByText('Under Work', { exact: true }).waitFor()
  await resolve('GPS only sighting')
  await citizen.getByText('Resolved', { exact: true }).waitFor()

  execFileSync(python, ['-m', 'tools.seed_villages'], { stdio: 'inherit' })
  const observer = await browser.newPage({
    viewport: { width: 430, height: 900 }, geolocation: { latitude: 21.735, longitude: 79.35 }, permissions: ['geolocation'],
  })
  await signUp(observer, 'Village observer', '9876500146')
  await observer.getByRole('radio', { name: 'Choose village', exact: true }).click()
  for (const name of villages) await villageOption(observer, name).waitFor()
  await villageOption(observer, 'Anandpur').click()
  await button(observer, 'Save location and continue').click()
  await observer.getByRole('tab', { name: 'Profile', exact: true }).click()
  await observer.getByText('Anandpur (Demo)', { exact: true }).waitFor()
  await observer.getByLabel(/^Saved location: Anandpur/).click()
  for (const name of villages) await villageOption(observer, name).waitFor()
  await villageOption(observer, 'Vanpur').click()
  await button(observer, 'Save profile').click()
  await observer.getByText('Profile saved.', { exact: true }).waitFor()
  const profile = await (await observer.request.get(`${authority}/api/citizen/profile`)).json()
  assert.equal(profile.location.village.code, 'V002')
  assert.equal((await (await citizen.request.get(`${authority}/api/citizen/profile`)).json()).location.type, 'gps')

  await observer.getByRole('tab', { name: 'Home', exact: true }).click()
  const code = await report(observer, 'Village sighting', async () => {
    await observer.getByRole('radio', { name: 'Current location', exact: true }).click()
    await observer.getByText('GPS location selected').waitFor()
    await observer.getByRole('radio', { name: 'Choose village', exact: true }).click()
    for (const name of villages) await villageOption(observer, name).waitFor()
    await villageOption(observer, 'Haritgaon').click()
  }, true)
  await observer.getByText('Haritgaon (Demo)', { exact: true }).waitFor()
  const submitted = await (await observer.request.get(`${authority}/api/citizen/reports/${code}`)).json()
  assert.notEqual(submitted.village_id, profile.location.village.id)
  assert.equal(submitted.location_source, 'village')
  assert.equal(submitted.lat, null)
  assert.equal(submitted.lon, null)
  await nav.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await official.getByText(/Haritgaon \(Demo\)/).waitFor()
  const approved = await review('Village sighting', 'Haritgaon (Demo)', 2, true)
  assert.equal(approved.village_id, submitted.village_id)
  assert.equal(approved.confirmed_species, 'other')
  assert.equal(approved.risk.assessment_method, 'manual')
  await observer.getByText('Under Work', { exact: true }).waitFor()
  await button(citizen, 'Back').click()
  await citizen.getByText(/Illustrative Pench area.*Haritgaon/).waitFor()
  const publicAlerts = async () => (await (await citizen.request.get(
    `${authority}/api/community/alerts?verified_only=true&field_only=true`,
  )).json()).items
  assert.equal((await publicAlerts()).length, 1)
  assert.equal((await publicAlerts())[0].severity, 'low')
  assert.deepEqual((await publicAlerts())[0].village_ids, [submitted.village_id])

  await nav.getByRole('link', { name: 'Map', exact: true }).click()
  for (const name of villages) await official.getByTitle(`Village · ${name} (Demo)`).waitFor()
  await official.getByRole('option', { name: /Village sighting/ }).waitFor({ state: 'attached' })
  await official.getByRole('checkbox', { name: /Village locations and boundaries/ }).uncheck()
  await official.getByTitle('Village · Haritgaon (Demo)').waitFor({ state: 'detached' })
  await official.getByRole('option', { name: /Village sighting/ }).waitFor({ state: 'attached' })
  await resolve('Village sighting')
  await observer.getByText('Resolved', { exact: true }).waitFor()
  await citizen.getByText('No nearby alerts', { exact: false }).waitFor()
  assert.deepEqual(await publicAlerts(), [])
  console.log('Shared village browser workflow passed, including PATCH /api/reports/1 with zero villages.')
} finally {
  await browser.close()
}
