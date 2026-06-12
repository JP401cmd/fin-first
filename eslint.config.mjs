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
    // Vendor/gegenereerd: pdfjs-worker en serwist service-worker.
    "public/**",
  ]),
  {
    rules: {
      // React-compiler-prep-regels: advisory (warn) tot de overtredingen
      // gericht zijn weggewerkt — errors blijven gereserveerd voor echte bugs.
      // rules-of-hooks en exhaustive-deps behouden hun default-zwaarte.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/error-boundaries": "warn",
      // Aspiratie, geen ship-blokkade: any's geleidelijk wegwerken.
      "@typescript-eslint/no-explicit-any": "warn",
      // Cosmetisch en hinderlijk in Nederlandse UI-teksten (apostrofs/quotes).
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
