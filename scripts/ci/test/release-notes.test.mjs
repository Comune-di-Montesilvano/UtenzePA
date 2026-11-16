// Test di scripts/release-notes.sh (job security-scripts di tests.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/release-notes.sh');

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  mkdirSync(join(dir, 'docs/releases'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const GOOD = '## Changelog\n\n### Correzioni\n\n- fix\n\n### Sicurezza\n\n- Nessuna modifica di sicurezza.\n';

test('note complete: ok', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': GOOD });
  const r = run(dir, 'check', 'v1.2.3');
  assert.equal(r.code, 0, r.out);
});

test('note con CRLF: ok', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': GOOD.replace(/\n/g, '\r\n') });
  assert.equal(run(dir, 'check', 'v1.2.3').code, 0);
});

test('file mancante: errore', () => {
  const r = run(repo({}), 'check', 'v1.2.3');
  assert.equal(r.code, 1);
  assert.match(r.out, /Note di rilascio mancanti/);
});

test('senza «## Changelog»: errore', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': GOOD.replace('## Changelog', '# Note') });
  const r = run(dir, 'check', 'v1.2.3');
  assert.equal(r.code, 1);
  assert.match(r.out, /## Changelog/);
});

test('senza «### Sicurezza»: errore', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': '## Changelog\n\n### Correzioni\n\n- fix\n' });
  const r = run(dir, 'check', 'v1.2.3');
  assert.equal(r.code, 1);
  assert.match(r.out, /### Sicurezza/);
});

test('«### Sicurezza» vuota: errore', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': '## Changelog\n\n### Sicurezza\n\n### Aggiornamento\n\n- niente\n' });
  const r = run(dir, 'check', 'v1.2.3');
  assert.equal(r.code, 1);
  assert.match(r.out, /vuota/);
});

test('versione non valida: errore', () => {
  assert.equal(run(repo({}), 'check', '1.2.3').code, 1);
  assert.equal(run(repo({}), 'check', 'v1.2.3/../../x').code, 1);
});

test('check-publiccode legge softwareVersion', () => {
  const ok = repo({ 'publiccode.yml': 'publiccodeYmlVersion: "0.4"\r\nsoftwareVersion: "v1.2.3"\r\n', 'docs/releases/v1.2.3.md': GOOD });
  assert.equal(run(ok, 'check-publiccode').code, 0);
  const missing = repo({ 'publiccode.yml': 'softwareVersion: "v1.2.4"\n', 'docs/releases/v1.2.3.md': GOOD });
  const r = run(missing, 'check-publiccode');
  assert.equal(r.code, 1);
  assert.match(r.out, /v1\.2\.4\.md/);
});

test('body: note + digest delle tre immagini + verifica', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': GOOD });
  for (const [app, d] of [['backend', 'sha256:aaa'], ['frontend', 'sha256:bbb'], ['tinn', 'sha256:ccc']]) {
    mkdirSync(join(dir, `handoff/release-${app}`), { recursive: true });
    writeFileSync(join(dir, `handoff/release-${app}/digest`), `${d}\n`);
  }
  const r = run(dir, 'body', 'v1.2.3', 'handoff');
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.startsWith('## Changelog\n'));
  assert.match(r.out, /\n## Immagini\n/);
  assert.match(r.out, /`ghcr\.io\/comune-di-montesilvano\/utenzepa-backend:v1\.2\.3@sha256:aaa`/);
  assert.match(r.out, /utenzepa-tinn:v1\.2\.3@sha256:ccc/);
  assert.match(r.out, /scripts\/verify-images\.sh v1\.2\.3/);
});

test('body: digest mancante = errore', () => {
  const dir = repo({ 'docs/releases/v1.2.3.md': GOOD });
  const r = run(dir, 'body', 'v1.2.3', 'handoff');
  assert.equal(r.code, 1);
  assert.match(r.out, /digest/);
});
