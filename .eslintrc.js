module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
        'plugin:prettier/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: [ '@typescript-eslint', 'prettier'],
    rules: {
        'no-unused-vars': 'off',
        //"indent": ["error", 4],
        //"indent": "off",
        'sort-imports': [
            'error',
            {
                ignoreDeclarationSort: true,
                allowSeparatedGroups: false,
            },
        ],
        'prettier/prettier': ['error'],
    },
}
