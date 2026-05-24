module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module", // Change to "script" if you are using standard CommonJS require()
  },
  rules: {
    "no-unused-vars": "warn",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignores built files if using TypeScript
    "/node_modules/**/*",
  ],
};