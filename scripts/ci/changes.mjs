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

function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  let code = true;
  if (base) {
    try {
      const files = changedFiles(base, head);
      code = !isDocsOnly(files);
      console.log(`${files.length} file cambiati, sola documentazione: ${!code}`);
    } catch (e) {
      console.log(`::warning::diff non calcolato (${e.message.split('\n')[0]}): eseguo tutto`);
    }
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  else console.log(`code=${code}`);
}
