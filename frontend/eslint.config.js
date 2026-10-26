// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

// Lint del frontend (job frontend di tests.yml). Regole recommended di ESLint, typescript-eslint
// e angular-eslint; spente o declassate solo quelle in contrasto con scelte del progetto:
// gli errori bloccano la CI, i warning restano visibili da sistemare col tempo.
module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Tutti i componenti sono ChangeDetectionStrategy.Eager per scelta (CLAUDE.md).
      "@angular-eslint/prefer-on-push-component-change-detection": "off",
      // Iniezione nel costruttore ancora diffusa: migrazione a inject() solo di stile.
      "@angular-eslint/prefer-inject": "off",
      // Selettori, output on* e alias storici usati in tutti i template: rinominarli non
      // porta niente.
      "@angular-eslint/directive-selector": "off",
      "@angular-eslint/component-selector": "off",
      "@angular-eslint/no-output-on-prefix": "off",
      "@angular-eslint/no-input-rename": "off",
      // Namespace affiancati agli enum per le etichette (Phase.label(), ...).
      "@typescript-eslint/no-namespace": "off",
      // Callback vuote volute (ControlValueAccessor, subscribe({error: () => {}})).
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {
      // `!= null` = null o undefined: idioma voluto nei template.
      "@angular-eslint/template/eqeqeq": ["error", { allowNullOrUndefined: true }],
      // Righe e card cliccabili senza tastiera: da sistemare, intanto visibili come warning.
      "@angular-eslint/template/click-events-have-key-events": "warn",
      "@angular-eslint/template/interactive-supports-focus": "warn",
    },
  },
]);
