import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactCompiler from 'eslint-plugin-react-compiler';
import globals from 'globals';
import jest from 'eslint-plugin-jest';
import regexp from 'eslint-plugin-regexp';

export default [
  {
    ignores: [
      'dist/*',
      '**/node_modules/',
      '**/*.d.ts',
      'coverage/',
      'android/*',
      'ios/*',
      '.expo/*',
      'python-app/*',
      '.agents/*'
    ]
  },
  ...expoConfig,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      // Type-aware linting: required for the correctness rules below
      // (floating promises, unsorted numeric/date arrays).
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-compiler': reactCompiler,
      regexp: regexp
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Do not use TypeScript enums. Use const objects with as const instead (see AGENTS.md).'
        }
      ],
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      // Correctness gates (Sonar bug classes S9383 / S2871): unhandled async
      // calls fail silently, and .sort() without a comparator sorts numeric or
      // date arrays alphabetically, corrupting stats silently.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
      // Visibility gates: complexity and sequential awaits surface during
      // writing rather than weeks later in a Sonar scan.
      complexity: ['warn', 15],
      'no-await-in-loop': 'warn',
      // Sonar smell mirrors (readability & regex safety): warn-level so they
      // surface at write time without blocking, caught before a scan finds them.
      'no-nested-ternary': 'warn',
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme', 'xxx', 'hack'] }],
      // Super-linear backtracking is a hang vector on user input (archives,
      // URLs) - hard error in product code (Sonar S8786 mirror).
      'regexp/no-super-linear-backtracking': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Existing screens compute derived state in effects; react-compiler/react-compiler enforces compiler bailout rules
      'react-hooks/set-state-in-effect': 'off',
      'react-compiler/react-compiler': 'error',
      'no-empty-pattern': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-redeclare': 'off',
      'import/no-named-as-default-member': 'off',
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto'
        }
      ]
    }
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    plugins: {
      regexp: regexp
    },
    rules: {
      'regexp/no-super-linear-backtracking': 'error',
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto'
        }
      ]
    }
  },
  {
    files: ['__tests__/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}'],
    plugins: {
      jest
    },
    rules: {
      // Mirrors Sonar S5906 (assertion specificity): jest's own matchers beat
      // generic toBe/toBe(true) - readable failure diffs are the point.
      'jest/expect-expect': 'warn',
      'jest/prefer-comparison-matcher': 'warn',
      'jest/prefer-to-have-length': 'warn',
      'jest/no-standalone-expect': 'error',
      // The portability spec's import-parsing regex runs on repo source, not
      // user input - the hang risk the rule guards is product-code only.
      'regexp/no-super-linear-backtracking': 'off'
    }
  }
];
