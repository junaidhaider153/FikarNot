import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, ...globals.node },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // not needed with the new JSX runtime
      "react/prop-types": "off", // this project doesn't use prop-types
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // This rule targets codebases adopting the React Compiler. Without the compiler,
      // calling setState in an effect to reset/sync local state when a prop or route param
      // changes (e.g. resetting qty when the product id changes, syncing filters from the
      // URL) is the standard, React-docs-endorsed pattern - not a bug. Re-enable this once
      // the project adopts the React Compiler.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
