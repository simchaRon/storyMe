// Tests for the pure error helpers. Node runs the .ts file directly (it has no imports).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detailText, errorKey } from '../src/api/errors.ts';

test('status codes map to the right message key', () => {
  assert.equal(errorKey(0), 'errors.network');
  assert.equal(errorKey(401), 'errors.unauthorized');
  assert.equal(errorKey(409), 'errors.conflict');
  assert.equal(errorKey(422), 'errors.validation');
  assert.equal(errorKey(429), 'errors.tooMany');
  assert.equal(errorKey(504), 'errors.timeout');
  assert.equal(errorKey(408), 'errors.timeout');
  assert.equal(errorKey(502), 'errors.serviceBusy');
  assert.equal(errorKey(503), 'errors.serviceBusy');
  assert.equal(errorKey(500), 'errors.server');
  assert.equal(errorKey(404), 'errors.generic');
});

test('detailText reads FastAPI error bodies', () => {
  assert.equal(detailText({ detail: 'Email is already registered' }), 'Email is already registered');
  assert.equal(detailText({ detail: [{ msg: 'field required' }] }), 'field required');
  assert.equal(detailText({ detail: [] }), 'Something went wrong');
  assert.equal(detailText(null), 'Something went wrong');
  assert.equal(detailText('nonsense'), 'Something went wrong');
});
