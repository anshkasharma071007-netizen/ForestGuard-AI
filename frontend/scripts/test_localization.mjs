import assert from 'node:assert/strict'
import { test } from 'node:test'
import { languageTools, translator } from '../src/i18n/translate.js'
import { formatDateTime } from '../src/utils/format.js'

test('English is the source fallback and Hindi uses the same interpolation fields', () => {
  const en = translator('en')
  const hi = translator('hi')
  assert.equal(en('Dashboard'), 'Dashboard')
  assert.equal(hi('Dashboard'), 'डैशबोर्ड')
  assert.equal(hi('New feature · {id}', { id: 'FG-001' }), 'New feature · FG-001')
  assert.equal(hi('Evidence for {reference}', { reference: 'Dashboard' }), 'Dashboard का साक्ष्य')
  assert.match(formatDateTime('2026-11-28T12:00:00Z', 'hi'), /नव/)
})

test('standard terms use canonical inputs and legacy advisories preserve original names', () => {
  const { term, advisorySummary, errorText } = languageTools('hi')
  assert.equal(term('report', 'under_work'), 'कार्रवाई जारी')
  assert.equal(term('role', 'range_officer'), 'रेंज अधिकारी')
  assert.equal(term('species', 'tiger'), 'बंगाल का बाघ')
  assert.equal(term('risk', 'high'), 'उच्च')
  const legacy = 'Precautionary advisory: Bengal tiger activity reported near Tiger. Follow forest-department safety guidance and avoid travelling on forest roads after dusk. Treat with general wildlife caution until the record is verified.'
  assert.match(advisorySummary(legacy), /Tiger के पास.*बंगाल का बाघ/)
  assert.equal(advisorySummary('Keep this authority-written note as entered.'), 'Keep this authority-written note as entered.')
  assert.match(errorText('File exceeds the 25 MB upload limit.'), /25 MB/)
  assert.match(errorText('Unknown server exception'), /^अनुरोध पूरा नहीं हुआ/)
})
