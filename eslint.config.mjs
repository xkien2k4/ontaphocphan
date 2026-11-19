import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'DRAFT_firestore.rules'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
