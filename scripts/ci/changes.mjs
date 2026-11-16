// PR o merge group di sola documentazione: i job pesanti di tests.yml saltano (restando
// verdi, così i check obbligatori non restano in attesa). Documentazione = file in docs/
// o .md, tranne la guida operatori (servita dall'app e controllata dalla build).
// Uso in CI: node scripts/ci/changes.mjs <base> <head> → code=true|false su $GITHUB_OUTPUT.
// Ogni dubbio (diff vuoto, git che fallisce, base mancante) = code=true.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GUIDE = 'frontend/public/guida/guida.md';

export function isDocsOnly(files) {
  if (!files.length) return false;
  return files.every((f) => f !== GUIDE && (f.startsWith('docs/') || f.endsWith('.md')));
}

// --no-renames: un file di codice spostato in docs/ compare anche col percorso eliminato.
function changedFiles(base, head, cwd) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').filter(Boolean);
}

// true = eseguire i job pesanti.
export function needsCode(base, head = 'HEAD', cwd = process.cwd()) {
  if (!base) return true;
  try {
    const files = changedFiles(base, head, cwd);
    console.log(`${files.length} file cambiati, sola documentazione: ${isDocsOnly(files)}`);
    return !isDocsOnly(files);
  } catch (e) {
    console.log(`::warning::diff non calcolato (${e.message.split('\n')[0]}): eseguo tutto`);
    return true;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  const code = needsCode(base, head);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  else console.log(`code=${code}`);
}
