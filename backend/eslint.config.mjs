import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.spec.ts',
      'eslint.config.mjs',
      '.commitlintrc.js',
      'jest.integration.config.js',
    ],
  },
  // Base ESLint recommended rules
  eslint.configs.recommended,
  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommended,
  // Prettier config (must be last)
  prettier,
  // Custom configuration
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        // Use the active working directory so tools running in sandboxes (e.g. Trunk) resolve the TS project correctly.
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
      },
      globals: {
        node: true,
        jest: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': [
        'error',
        {},
        {
          usePrettierrc: true,
        },
      ],
    },
  },
  // SQL a mano solo nei file *.sql.ts (con il motivo nel commento), nelle migration e nei test:
  // altrove repository o QueryBuilder.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.sql.ts', 'src/database/**', 'src/**/*.int-spec.ts', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='query']",
          message: 'SQL a mano solo in *.sql.ts (motivo nel commento): usare repository o QueryBuilder.',
        },
        {
          selector: "CallExpression[callee.computed=true][callee.property.value='query']",
          message: 'SQL a mano solo in *.sql.ts (motivo nel commento): usare repository o QueryBuilder.',
        },
      ],
    },
  }
);
