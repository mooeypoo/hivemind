import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/', '.netlify/', 'coverage/', 'test/boundaries/fixture/'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  vue.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // TypeScript already reports undefined names, including browser globals in .vue files.
      'no-undef': 'off',
    },
  },
  {
    // The one plain-JS file: the pre-paint theme script (see AGENTS.md, Web app).
    files: ['src/web/public/theme-init.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    // AGENTS.md: the CSP (style-src 'self') blocks inline styles, so all styling lives in
    // static CSS under src/web/public.
    files: ['src/web/**/*.vue'],
    rules: {
      'vue/no-restricted-block': [
        'error',
        { element: 'style', message: 'Put styles in src/web/public/styles/ (CSP).' },
      ],
      'vue/no-restricted-static-attribute': [
        'error',
        { key: 'style', message: 'Use a class (CSP).' },
      ],
      'vue/no-restricted-v-bind': ['error', { argument: 'style', message: 'Use a class (CSP).' }],
    },
  },
  {
    // AGENTS.md: domain errors are returned as values, not thrown.
    files: ['src/contexts/*/domain/**/*.ts', 'src/contexts/*/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement',
          message: 'Return a DomainError in a Result instead of throwing.',
        },
      ],
    },
  },
  prettier,
);
