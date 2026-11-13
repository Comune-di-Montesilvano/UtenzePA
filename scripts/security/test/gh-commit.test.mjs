import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileChanges } from '../gh-commit.mjs';

// Allowlist di default = autofix.config.json di UtenzePA.
const read = (p) => Buffer.from(`contenuto di ${p}`);

test('modificati e aggiunti → additions base64, cancellati → deletions', () => {
  const status = ' M backend/pnpm-lock.yaml\0 M frontend/package.json\0?? backend/pnpm-workspace.yaml\0 D tinn/Dockerfile\0';
  assert.deepEqual(buildFileChanges(status, read), {
    additions: [
      { path: 'backend/pnpm-lock.yaml', contents: Buffer.from('contenuto di backend/pnpm-lock.yaml').toString('base64') },
      { path: 'frontend/package.json', contents: Buffer.from('contenuto di frontend/package.json').toString('base64') },
      { path: 'backend/pnpm-workspace.yaml', contents: Buffer.from('contenuto di backend/pnpm-workspace.yaml').toString('base64') },
    ],
    deletions: [{ path: 'tinn/Dockerfile' }],
  });
});

test('rinomina (porcelain -z: R nuovo\\0vecchio) → addition + deletion', () => {
  const r = buildFileChanges('R  frontend/Dockerfile\0backend/Dockerfile\0', read);
  assert.deepEqual(r.additions.map((x) => x.path), ['frontend/Dockerfile']);
  assert.deepEqual(r.deletions, [{ path: 'backend/Dockerfile' }]);
});

test('file sotto .cache/ ignorati (scan e tool)', () => {
  const r = buildFileChanges('?? .cache/autofix/audit.json\0 M backend/pnpm-lock.yaml\0', read);
  assert.deepEqual(r.additions.map((x) => x.path), ['backend/pnpm-lock.yaml']);
});

test('nessuna modifica → liste vuote', () => assert.deepEqual(buildFileChanges('', read), { additions: [], deletions: [] }));

test('file fuori allowlist → errore (mai committati dal bot)', () => {
  assert.throws(() => buildFileChanges(' M scripts/security/diff-gate.mjs\0 M backend/pnpm-lock.yaml\0', read), /fuori allowlist: scripts\/security\/diff-gate\.mjs/);
  assert.throws(() => buildFileChanges(' M .github/workflows/security.yml\0', read), /fuori allowlist/);
  assert.throws(() => buildFileChanges(' D backend/src/main.ts\0', read), /fuori allowlist/);
  // e2e (solo dev), compose e radice non li tocca l'autofix.
  assert.throws(() => buildFileChanges(' M e2e/pnpm-lock.yaml\0', read), /fuori allowlist/);
  assert.throws(() => buildFileChanges(' M docker-compose.yml\0', read), /fuori allowlist/);
  assert.throws(() => buildFileChanges(' M pnpm-lock.yaml\0', read), /fuori allowlist/);
});

test('allowlist copre lockfile, manifest, workspace e Dockerfile dei progetti', () => {
  const ok = ['backend', 'frontend'].flatMap((d) => [` M ${d}/package.json`, ` M ${d}/pnpm-lock.yaml`, ` M ${d}/pnpm-workspace.yaml`, ` M ${d}/Dockerfile`])
    .concat(' M tinn/Dockerfile');
  assert.equal(buildFileChanges(ok.join('\0') + '\0', read).additions.length, ok.length);
});
