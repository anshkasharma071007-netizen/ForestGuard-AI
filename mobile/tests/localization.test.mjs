import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './hi' ? './hi.ts' : specifier, context);
  },
});
const { translator, termLabel, localizedAdvisoryTitle, localizedError } = await import('../i18n/translate.ts');
const { reportStatuses } = await import('../report-status.ts');
hooks.deregister();

test('report lifecycle labels use the saved canonical values in both languages', () => {
  const en = translator('en');
  const hi = translator('hi');
  assert.deepEqual(['pending', 'under_work', 'rejected', 'resolved'].map(key => hi(reportStatuses[key].label)),
    ['समीक्षा लंबित', 'कार्रवाई जारी', 'अस्वीकृत', 'समाधान पूर्ण']);
  assert.equal(en(reportStatuses.under_work.label), 'Under Work');
  assert.equal(hi('Future label for {id}', { id: 'FG-001' }), 'Future label for FG-001');
});

test('localized citizen messages use structured event, advisory, and validation inputs', () => {
  const hi = translator('hi');
  assert.equal(termLabel(hi, 'event', 'approved', 'Report updated'), 'रिपोर्ट स्वीकृत हुई');
  assert.equal(termLabel(hi, 'risk', 'high'), 'उच्च जोखिम');
  assert.equal(localizedAdvisoryTitle(hi, 'hi', 'Bengal tiger sighting', 'Bengal tiger'), 'वन्यजीव दिखा · बंगाल का बाघ');
  assert.equal(localizedAdvisoryTitle(hi, 'hi', 'A title as entered', 'Bengal tiger'), 'A title as entered');
  assert.match(localizedError(hi, 'hi', 'Too many requests. Try again in 15 seconds.'), /15 सेकंड/);
  assert.match(localizedError(hi, 'hi', 'Unknown server exception'), /^अनुरोध पूरा नहीं हुआ/);
});
