// Test d'integrazione (`*.int-spec.ts`) su MySQL vero: stessa configurazione jest degli
// unit (letta da package.json, niente copie da riallineare), database `*_it` ricreato e
// migrato una volta per giro da global-setup.ts. Lanciare con --runInBand (`pnpm run test:int`).
// In JavaScript: Node 26 caricherebbe un config .ts come modulo ES (niente __dirname).
const base = require('./package.json').jest;

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: base.moduleFileExtensions,
  moduleDirectories: base.moduleDirectories,
  moduleNameMapper: base.moduleNameMapper,
  transform: base.transform,
  transformIgnorePatterns: base.transformIgnorePatterns,
  testEnvironment: base.testEnvironment,
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  testTimeout: 30000,
};
