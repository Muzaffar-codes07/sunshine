const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scheduleSurveySchema, rescheduleSurveySchema, submitSurveySchema, rejectSurveySchema, approveSurveySchema } = require('../dist');

const fieldErrors = (result) => result.error.issues.map((issue) => issue.path[0]);
const technicianId = 'b3f02476-10ba-43dd-aa92-b3129796c148';
const submission = { version: 1, roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: 22, usableRoofAreaSqm: '30', notes: '  ' };

test('scheduling needs a technician ID and a timezone-aware time', () => {
  assert.deepEqual(scheduleSurveySchema.parse({ technicianId, scheduledFor: '2026-11-02T10:30:00+05:30' }),
    { technicianId, scheduledFor: '2026-11-02T10:30:00+05:30' });
  for (const [field, value] of [['technicianId', 'tech-1'], ['scheduledFor', 'tomorrow'], ['scheduledFor', '2026-11-02T10:30:00']]) {
    const result = scheduleSurveySchema.safeParse({ technicianId, scheduledFor: '2026-11-02T05:00:00Z', [field]: value });
    assert.equal(result.success, false, `${field}=${value}`);
    assert.deepEqual(fieldErrors(result), [field]);
  }
  assert.equal(rescheduleSurveySchema.safeParse({ technicianId, scheduledFor: '2026-11-02T05:00:00Z' }).success, false, 'version required');
});

test('submission fixes decimal places, drops blank notes and checks every measurement', () => {
  assert.deepEqual(submitSurveySchema.parse(submission), {
    version: 1, roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00', notes: undefined,
  });
  for (const [field, value] of [
    ['roofDirection', 'SOUTH'], ['roofDirection', undefined], ['roofTiltDeg', 91], ['roofTiltDeg', '12.25'], ['roofTiltDeg', ''],
    ['cableDistanceM', -1], ['cableDistanceM', 1000.5], ['usableRoofAreaSqm', '  '], ['notes', 'x'.repeat(2001)],
  ]) {
    const result = submitSurveySchema.safeParse({ ...submission, [field]: value });
    assert.equal(result.success, false, `${field}=${JSON.stringify(value)}`);
    assert.deepEqual(fieldErrors(result), [field]);
  }
  assert.equal(submitSurveySchema.parse({ ...submission, roofTiltDeg: 0 }).roofTiltDeg, '0.0', 'a flat roof is a real measurement');
});

test('a rejection needs a reason; client cannot send status, decider or extra fields', () => {
  assert.deepEqual(fieldErrors(rejectSurveySchema.safeParse({ version: 2 })), ['reason']);
  assert.equal(rejectSurveySchema.parse({ version: 2, reason: ' Tilt not measured ' }).reason, 'Tilt not measured');
  assert.equal(approveSurveySchema.safeParse({ version: 2, decidedById: technicianId }).success, false);
  assert.equal(submitSurveySchema.safeParse({ ...submission, status: 'APPROVED' }).success, false);
});
