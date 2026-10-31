const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apiErrorSchema, refusalReasonSchema } = require('../dist');

const envelope = (extra) => ({ error: { code: 'SURVEY_NOT_APPROVED', message: 'Approve the survey first.', fieldErrors: {}, requestId: '0e8f2a0c-5a4e-4c55-9b51-55a6f2b55a10', ...extra } });
const reason = { code: 'SURVEY_NOT_APPROVED', reason: 'The site survey is not approved.', source: 'SURVEY', nextAction: 'Approve the latest survey revision.' };

test('409 errors may carry refusal reasons; existing envelopes without them stay valid', () => {
  assert.ok(apiErrorSchema.safeParse(envelope()).success);
  assert.ok(apiErrorSchema.safeParse(envelope({ reasons: [reason] })).success);
  assert.equal(apiErrorSchema.safeParse(envelope({ reasons: [] })).success, false, 'an empty list says nothing; omit it');
});

test('a refusal reason needs upper-case codes and all four facts, and nothing else', () => {
  assert.ok(refusalReasonSchema.safeParse(reason).success);
  for (const bad of [
    { ...reason, code: 'survey_not_approved' }, { ...reason, source: 'survey module' }, { ...reason, nextAction: '' },
    { code: reason.code, reason: reason.reason, source: reason.source }, { ...reason, stack: 'at SurveysService' },
  ]) {
    assert.equal(refusalReasonSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});
