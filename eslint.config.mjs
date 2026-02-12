import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "client/src/**/*.ts", "client/src/**/*.tsx"],
    ignores: ["node_modules/", "dist/", ".cache/"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-redeclare": "warn",
      "no-unsafe-finally": "error",
      "eqeqeq": ["warn", "smart"],
      "no-var": "warn",
      "prefer-const": "warn",
    },
  },
];
