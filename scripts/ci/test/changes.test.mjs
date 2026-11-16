// Test di scripts/ci/changes.mjs (job security-scripts di tests.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDocsOnly, needsCode } from '../changes.mjs';

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

// Repo git temporaneo con un commit di base: restituisce cartella, sha di base e git().
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'changes-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  git('init', '-q');
  mkdirSync(join(dir, 'backend'));
  writeFileSync(join(dir, 'backend/x.ts'), 'export const x = 1;');
  writeFileSync(join(dir, 'README.md'), '# r');
  git('add', '.');
  git('commit', '-qm', 'base');
  return { dir, base: git('rev-parse', 'HEAD'), git };
}

test('codice spostato in docs/: il percorso eliminato è codice, esegue tutto', (t) => {
  const { dir, base, git } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'docs'));
  git('mv', 'backend/x.ts', 'docs/x.md');
  git('commit', '-qm', 'rename');
  assert.equal(needsCode(base, 'HEAD', dir), true);
});

test('sola documentazione cambiata: salta', (t) => {
  const { dir, base, git } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'README.md'), '# r2');
  git('commit', '-qam', 'doc');
  assert.equal(needsCode(base, 'HEAD', dir), false);
});

test('base vuota o inesistente: esegue tutto', (t) => {
  const { dir } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(needsCode('', 'HEAD', dir), true);
  assert.equal(needsCode('0000000000000000000000000000000000000000', 'HEAD', dir), true);
});
