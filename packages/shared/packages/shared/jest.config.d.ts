declare const _default: {
    displayName: string;
    preset: string;
    testEnvironment: string;
    roots: string[];
    transform: {
        '^.+\\.[tj]sx?$': (string | {
            tsconfig: string;
        })[];
    };
    moduleFileExtensions: string[];
    coverageDirectory: string;
};
export default _default;
