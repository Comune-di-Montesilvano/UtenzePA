// Mock manuale (convenzione Jest: file in __mocks__/ adiacente a node_modules,
// applicato automaticamente a ogni require del pacchetto, nessun jest.mock()
// necessario) — @nestjs/schedule@12 è pubblicato come ESM puro
// ("type": "module" in package.json, nessuna build CJS): ts-jest/jest-runtime
// (CommonJS) non riescono a caricarlo ("SyntaxError: Unexpected token
// 'export'"). A runtime Node 24+ lo richiede via require(esm) senza problemi
// (vedi backend/Dockerfile, engines node ^24) — il problema è solo nella
// toolchain di test, non nell'app reale.
//
// @Cron qui è un no-op: gli unit test coprono la logica dei service, mai la
// schedulazione reale (il decorator non viene mai eseguito in test).
export function Cron(..._args: unknown[]) {
  return () => {};
}

// Proxy invece di ricopiare a mano l'enum reale (70+ membri, vedi
// dist/enums/cron-expression.enum.d.ts): ritorna il valore cron vero per
// l'unico membro usato nel codice (EVERY_DAY_AT_MIDNIGHT), il nome della
// chiave per qualsiasi altro — il type-check usa comunque i .d.ts reali
// (moduleNameMapper/mock agiscono solo a runtime), quindi TypeScript non si
// accorge della differenza.
export const CronExpression = new Proxy(
  { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
  {
    get: (target: Record<string, string>, prop: string) =>
      prop in target ? target[prop] : prop,
  },
);
