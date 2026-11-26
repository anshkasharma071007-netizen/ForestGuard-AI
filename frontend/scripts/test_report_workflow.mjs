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
const api = 'http://127.0.0.1:18765/api'
const firstPhone = '9876500145'
const secondPhone = '9876500146'
const button = (name) => mobile.getByRole('button', { name, exact: true })
const field = (name) => mobile.getByLabel(name, { exact: true })

async function login(phone, name) {
  if (name) await field('Full name').fill(name)
  else await button('Already have an account? Sign in').click()
  await field('Phone number').fill(phone)
  await button('Continue').click()
  await field('Verification code').fill('1234')
  await button('Verify phone').click()
}

async function chooseVillage() {
  await mobile.getByRole('radio', { name: 'Choose village', exact: true }).click()
  await mobile.getByRole('radio', { name: /Workflow village/ }).click()
  await button('Save location and continue').click()
}
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
  await mobile.evaluate(() => localStorage.setItem('forest-guard-ai.report-references', JSON.stringify([{ referenceCode: 'LEGACY-PRIVATE' }])))
  await mobile.reload()
  await mobile.getByText('+91', { exact: true }).waitFor()
  assert.equal(await mobile.evaluate(() => localStorage.getItem('forest-guard-ai.report-references')), null)
  await field('Full name').fill('Browser observer')
  for (const invalid of ['1234567890', '987654321', '98765432100', '+12025550145', '02223456789', '987654321a']) {
    await field('Phone number').fill(invalid)
    await button('Continue').click()
    await mobile.getByText('Enter 10 digits starting with 6, 7, 8 or 9.').waitFor()
    assert.equal(await field('Verification code').count(), 0)
  }
  await field('Phone number').fill('8023456789')
  await button('Continue').click()
  await mobile.getByText('Enter an Indian mobile number.').waitFor()
  assert.equal(await field('Verification code').count(), 0)
  await field('Phone number').fill(firstPhone)
  await mobile.getByRole('button', { name: 'Continue', exact: true }).click()
  await mobile.getByLabel('Verification code', { exact: true }).fill('4321')
  await mobile.getByRole('button', { name: 'Verify phone', exact: true }).click()
  await mobile.getByText('Incorrect verification code.').waitFor()
  await mobile.getByLabel('Verification code', { exact: true }).fill('1234')
  await mobile.getByRole('button', { name: 'Verify phone', exact: true }).click()
  await chooseVillage()
  await mobile.getByText('No reports yet', { exact: true }).waitFor()
  const tabs = mobile.getByRole('tab')
  assert.deepEqual(await tabs.allTextContents(), ['Home', 'Map', 'Profile'])
  await mobile.goto('http://127.0.0.1:18766/')
  await mobile.getByRole('button', { name: 'New report', exact: true }).click()
  await mobile.getByText('Submit report', { exact: true }).click()
  await mobile.getByText('Enter a report title.').waitFor()
  await mobile.getByLabel('Title (required)', { exact: true }).fill('Elephant near the settlement')
  await mobile.getByRole('radio', { name: 'Sighting', exact: true }).click()
  await mobile.getByLabel(/^Species:/).click()
  await mobile.getByRole('radio', { name: /elephant/i }).click()
  await mobile.getByText('Choose village', { exact: true }).click()
  await mobile.getByRole('radio', { name: /Workflow village/ }).click()
  const choosing = mobile.waitForEvent('filechooser')
  await mobile.getByText('Gallery', { exact: true }).click()
  await (await choosing).setFiles('frontend/public/images/elephant.jpg')
  await mobile.getByText('Photo attached').waitFor()
  await button('Submit report').click()
  await mobile.getByText(/Could not reach Forest Guard/).waitFor()
  const pendingKey = await mobile.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('forest-guard.citizen-drafts.')))
  assert.ok(pendingKey)
  const submission = pendingKey.split('.').at(-1)
  await mobile.getByText('Submit report', { exact: true }).click()
  await mobile.getByText('Report received', { exact: true }).waitFor()
  const original = await mobile.getByText(/^FG-[A-F0-9]{24}$/).innerText()
  assert.ok(original)
  const citizenPhoto = mobile.waitForResponse((response) => response.url().endsWith(`/api/citizen/reports/${original}/evidence`))
  await mobile.getByRole('button', { name: 'View report', exact: true }).click()
  await mobile.getByText(original).waitFor()
  await mobile.getByRole('img', { name: 'Submitted incident photo' }).waitFor()
  assert.equal((await citizenPhoto).status(), 200)
  await official.getByText(original, { exact: true }).first().click()
  await official.getByRole('img', { name: 'Submitted field evidence' }).waitFor()
  await official.getByText(/% confidence/).waitFor({ timeout: 120000 })
  await official.getByLabel('Review notes').fill('Confirmed in field')
  await official.getByRole('button', { name: 'Verify', exact: true }).click()
  await official.getByText('Confirmed in field', { exact: true }).waitFor()
  await mobile.getByText('Under work', { exact: true }).waitFor()
  await official.getByRole('button', { name: 'Close', exact: true }).click()
  await official.getByRole('link', { name: /New field alert/ }).click()
  await official.getByText('Verified report', { exact: true }).first().waitFor()
  await mobile.getByRole('button', { name: 'Back', exact: true }).click()
  await mobile.getByRole('button').filter({ has: mobile.getByText('Asian elephant', { exact: true }) }).click()
  await mobile.getByText(/advisory: Asian elephant activity reported/).waitFor()
  await mobile.getByRole('radio', { name: 'Risk', exact: true }).click()
  await mobile.getByRole('radio', { name: 'Distance', exact: true }).click()
  await mobile.getByRole('tab', { name: 'Profile', exact: true }).click()
  assert.equal(await mobile.getByLabel('Phone number', { exact: true }).isEditable(), false)
  await mobile.getByRole('button', { name: 'Appearance', exact: true }).click()
  await mobile.getByRole('radio', { name: 'Dark', exact: true }).click()
  await mobile.getByRole('button', { name: 'Back', exact: true }).click()
  const receipt = api + '/citizen/report-receipt'
  const reportPath = api + '/citizen/reports/' + original
  const ownedReceipt = await mobile.request.post(receipt, { form: { submission_key: submission } })
  assert.equal((await ownedReceipt.json()).reference_code, original)
  const firstProfile = await (await mobile.request.get(api + '/citizen/profile')).json()
  const firstCookie = (await mobile.context().cookies()).find(c => c.name === 'forest_guard_citizen')
  assert.ok(firstCookie.httpOnly)

  let release
  const delayed = new Promise(resolve => { release = resolve })
  let captured
  const hasResponse = new Promise(resolve => { captured = resolve })
  const heldRequest = async route => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    captured()
    await delayed
    await route.fulfill({ response }).catch(() => {})
  }
  await mobile.route(api + '/citizen/reports', heldRequest, { times: 1 })
  await mobile.getByRole('tab', { name: 'Home', exact: true }).click()
  await hasResponse
  await mobile.getByText('Elephant near the settlement', { exact: true }).click()
  await mobile.getByRole('img', { name: 'Submitted incident photo' }).waitFor()
  await button('Back').click()
  await mobile.getByRole('tab', { name: 'Profile', exact: true }).click()
  const failLogout = route => route.abort('failed')
  await mobile.route(api + '/citizen/sign-out', failLogout)
  await button('Sign out').click()
  await mobile.getByText('Your account is hidden. Server sign-out could not be confirmed.').waitFor()
  assert.equal(await mobile.getByRole('img', { name: 'Submitted incident photo' }).count(), 0)
  assert.equal(await field('Full name').count(), 0)
  assert.equal(await mobile.getByText('Elephant near the settlement', { exact: true }).count(), 0)
  await mobile.unroute(api + '/citizen/sign-out', failLogout)
  await button('Retry sign-out').click()
  await button('Already have an account? Sign in').waitFor()
  assert.equal((await mobile.request.get(api + '/citizen/profile', {
    headers: { Authorization: 'Bearer ' + firstCookie.value },
  })).status(), 401)
  assert.equal((await mobile.request.get(reportPath)).status(), 401)

  await login(secondPhone, 'Second browser observer')
  // Location onboarding must offer an exit before a location has been saved.
  await button('Sign out').click()
  await login(secondPhone)
  await chooseVillage()
  release()
  await mobile.getByText('No reports yet', { exact: true }).waitFor()
  await mobile.getByRole('heading', { name: 'Asian elephant', exact: true }).click()
  await mobile.getByText(/advisory: Asian elephant activity reported/).waitFor()
  assert.equal(await mobile.getByText('Older references', { exact: true }).count(), 0)
  assert.equal(await mobile.getByText('Elephant near the settlement', { exact: true }).count(), 0)
  assert.equal(await mobile.getByRole('img', { name: 'Submitted incident photo' }).count(), 0)
  for (const path of [reportPath, reportPath + '/evidence']) {
    assert.equal((await mobile.request.get(path)).status(), 404)
  }
  assert.equal((await mobile.request.post(receipt, { form: { submission_key: submission } })).status(), 404)
  assert.equal((await mobile.request.get(api + '/reports')).status(), 401)
  await mobile.goto('http://127.0.0.1:18766/report-detail?code=' + original)
  await mobile.getByText('Report unavailable.', { exact: true }).waitFor()
  assert.equal(await mobile.getByRole('img', { name: 'Submitted incident photo' }).count(), 0)
  await mobile.goto('http://127.0.0.1:18766/')
  await mobile.getByText('No reports yet', { exact: true }).waitFor()
  await mobile.getByRole('tab', { name: 'Profile', exact: true }).click()
  await mobile.route(api + '/citizen/sign-out', failLogout)
  await button('Sign out').click()
  await button('Retry sign-out').waitFor()
  await mobile.goto('http://127.0.0.1:18766/')
  await button('Retry sign-out').waitFor()
  assert.equal(await field('Full name').count(), 0)
  await mobile.unroute(api + '/citizen/sign-out', failLogout)
  await button('Retry sign-out').click()

  await login(firstPhone)
  await mobile.getByText('Elephant near the settlement', { exact: true }).waitFor()
  await mobile.goto('http://127.0.0.1:18766/')
  await mobile.getByText('Elephant near the settlement', { exact: true }).waitFor()
  assert.deepEqual(await (await mobile.request.get(api + '/citizen/profile')).json(), firstProfile)
  await mobile.context().grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:18766' })
  await mobile.context().setGeolocation({ latitude: 21.76, longitude: 79.30 })
  await mobile.getByRole('tab', { name: 'Profile', exact: true }).click()
  await mobile.getByLabel('Full name', { exact: true }).fill('Updated browser observer')
  await mobile.getByRole('radio', { name: 'Current location', exact: true }).click()
  await mobile.getByText('GPS location selected', { exact: true }).waitFor()
  await mobile.getByRole('button', { name: 'Save profile', exact: true }).click()
  await mobile.getByText('Profile saved.', { exact: true }).waitFor()
  await mobile.getByRole('button', { name: 'Appearance', exact: true }).click()
  assert.equal(await mobile.getByRole('radio', { name: 'Dark', exact: true }).getAttribute('aria-checked'), 'true')
  assert.equal((await mobile.request.post(api + '/citizen/sign-out')).status(), 200)
  await mobile.goto('http://127.0.0.1:18766/')
  await button('Already have an account? Sign in').waitFor()
  console.log('Browser workflow passed, including account switching, private photo and receipt isolation, failed sign-out and session restoration.')
} catch (err) {
  for (const page of [mobile, official]) console.error(page.url(), (await page.locator('body').innerText()).slice(-2200))
  throw err
} finally {
  await browser.close()
}
