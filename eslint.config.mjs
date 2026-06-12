import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Geen broncode: agent-worktrees (incl. hun .next-output) en autoforge-state.
    ".claude/**",
    ".autoforge/**",
    // Losse CommonJS dev-scripts (require() is daar correct; geen app-code).
    "*.js",
    "scripts/**/*.js",
  ]),
]);

export default eslintConfig;
