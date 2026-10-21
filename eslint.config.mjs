import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactCompiler from 'eslint-plugin-react-compiler';
import globals from 'globals';

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
      'python-app/*'
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
      'react-compiler': reactCompiler
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
      'complexity': ['warn', 15],
      'no-await-in-loop': 'warn',
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
    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto'
        }
      ]
    }
  }
];
