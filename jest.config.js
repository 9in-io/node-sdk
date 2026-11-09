/**
 * @9in-io/sdk is consumed as TypeScript source (file: dependency on v2/packages/sdk): the
 * "@9in/source" export condition selects src/*.ts instead of dist/, ts-jest transpiles it
 * and `./x.js` imports are mapped to `./x`.
 */
module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    testEnvironmentOptions: {customExportConditions: ['@9in/source', 'node', 'node-addons']},
    roots: ['<rootDir>/src'],
    modulePathIgnorePatterns: ['<rootDir>/build', '<rootDir>/legacy'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@9in-io/)'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
