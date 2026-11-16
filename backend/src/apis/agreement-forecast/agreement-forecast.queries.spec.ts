import * as fs from 'fs';
import * as path from 'path';

// Le condizioni delle query (ordini, fatture valide, impegni della convenzione) sono
// provate sul database vero in agreement-forecast.int-spec.ts. Qui solo la regola che
// un test sui dati non vede: il collegamento passa dal contratto, mai dal codice di gara.
describe('query del fabbisogno', () => {
  it.each(['agreement-forecast.queries.ts'])('%s non passa dal CIG', (file) => {
    const text = fs.readFileSync(path.join(__dirname, file), 'utf-8').toLowerCase();
    expect(text.match(/\bcig\w*/g)).toBeNull();
  });
});
