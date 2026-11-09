const {existsSync} = require('fs');
const {dirname, join} = require('path');

/**
 * @9in-io/sdk comes from npm (dist/, ESM) or, during local development, from a link to
 * v2/packages/sdk. A link is run from TypeScript source: the "@9in/source" export condition
 * selects src/*.ts, which the npm package does not ship, so it is only used when src/ exists.
 * ts-jest transpiles both to CommonJS (allowJs for dist/*.js) and `./x.js` imports map to `./x`.
 */
const sdk = dirname(require.resolve('@9in-io/sdk/package.json'));
const fromSource = existsSync(join(sdk, 'src'));

module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    testEnvironmentOptions: {customExportConditions: [...(fromSource ? ['@9in/source'] : []), 'node', 'node-addons']},
    roots: ['<rootDir>/src'],
    modulePathIgnorePatterns: ['<rootDir>/build', '<rootDir>/legacy'],
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@9in-io/)'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
