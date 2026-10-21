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
