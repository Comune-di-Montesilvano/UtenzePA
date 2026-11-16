// Test di scripts/ci/changes.mjs (job security-scripts di tests.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDocsOnly } from '../changes.mjs';

test('solo documentazione: docs/ e file .md', () => {
  assert.equal(isDocsOnly(['docs/a.md', 'README.md']), true);
  assert.equal(isDocsOnly(['docs/releases/v1.md']), true);
  assert.equal(isDocsOnly(['docs/img.png']), true);
  assert.equal(isDocsOnly(['backend/README.md']), true);
});

test('la guida operatori è servita dall\'app: conta come codice', () => {
  assert.equal(isDocsOnly(['frontend/public/guida/guida.md']), false);
  assert.equal(isDocsOnly(['docs/a.md', 'frontend/public/guida/guida.md']), false);
});

test('basta un file di codice per eseguire tutto', () => {
  assert.equal(isDocsOnly(['docs/a.md', 'backend/src/x.ts']), false);
  assert.equal(isDocsOnly(['.github/workflows/tests.yml']), false);
});

test('diff vuoto o non calcolato: esegue tutto', () => {
  assert.equal(isDocsOnly([]), false);
});
