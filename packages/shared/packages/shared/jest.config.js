"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable */
exports.default = {
    displayName: 'shared',
    preset: '../../jest.preset.js',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: './tsconfig.json',
            },
        ],
    },
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageDirectory: '../../coverage/libs/shared',
};
//# sourceMappingURL=jest.config.js.map