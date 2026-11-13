// Scrive nel summary della run la coverage di un coverage-summary.json (Istanbul/V8,
// reporter json-summary). Solo misura, nessuna soglia (spec CI/CD, decisione D2).
//
//   node scripts/ci/coverage-summary.mjs <titolo> <percorso/coverage-summary.json>
import { appendFileSync, readFileSync } from 'node:fs';

const [title, file] = process.argv.slice(2);
if (!title || !file) {
  console.error('uso: coverage-summary.mjs <titolo> <coverage-summary.json>');
  process.exit(2);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const rows = ['lines', 'branches', 'functions', 'statements'].map(
  (k) => `| ${k} | ${total[k].pct}% | ${total[k].covered}/${total[k].total} |`,
);
const md = [`### Coverage ${title}`, '', '| | % | coperti |', '|---|---|---|', ...rows, ''].join('\n');

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
