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
    // Beperk dit regel-object tot exact dezelfde bestanden als de Next-config
    // die de `react-hooks`-plugin registreert (files: **/*.{js,jsx,mjs,ts,tsx,
    // mts,cts}). Zonder deze `files` zou dit object óók toegepast worden op
    // bestanden die Next NIET matcht (bv. een los `*.cjs`-scriptje), waar de
    // `react-hooks`-plugin dan niet geregistreerd is → "could not find plugin
    // react-hooks"-crash tijdens een volledige `eslint .`-run.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
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
      // Tijdzone-vangrail (eenduidige-gegevens-audit S9): markeer
      // `new Date(jaar, maand, …).toISOString()` als maandgrens. Een Date uit
      // lokale componenten via toISOString() schuift de grens in NL (UTC+) een
      // dag terug — vorige-maand-data lekt in het venster. `new Date()` zonder
      // argumenten (≤1 arg) blijft toegestaan: dat is een echte timestamp.
      //
      // Severity = "error": alle bestaande sites zijn gemigreerd naar
      // lib/month-range.ts (localMonthBounds / localMonthStart /
      // localMonthStartMonthsAgo / localMonthEnd). De enige bewuste
      // uitzondering is een gedragsneutrale demo-fixture met een gerichte
      // eslint-disable (app/test-freedom-days-monthly-trend/page.tsx). Een
      // error blokkeert nu elke NIEUWE occurrence van de tijdzone-trap.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="toISOString"][callee.object.type="NewExpression"][callee.object.callee.name="Date"][callee.object.arguments.length>=2]',
          message:
            "Gebruik lib/month-range.ts (localMonthBounds / localMonthStart / localMonthStartMonthsAgo) i.p.v. new Date(jaar, maand, …).toISOString() — die schuift de maandgrens in NL een dag terug.",
        },
        // Huishoudtype-vocabulaire-vangrail (hasPartner-bug, jun 2026): verbied
        // élke (in)gelijkheidsvergelijking van `household_type`/`householdType`
        // met de DODE woordenschat 'samenwonend'/'getrouwd'. De canonieke waarden
        // zijn 'solo'/'samen'/'gezin', dus zo'n vergelijking is ALTIJD false →
        // partners werden als alleenstaand behandeld (te lage Box 3-vrijstelling,
        // foute FIRE/gezondheid). Eén selector dekt beide vormen: de identifier
        // `household_type`/`householdType` matcht zowel een losse variabele als de
        // property van een member-access (profile.household_type). Bewust gescheiden
        // van de AOW-`leefsituatie`-enum ('alleenstaand'|'samenwonend'), die WEL
        // legitiem met 'samenwonend' vergelijkt en hier niet matcht (geen
        // household_type-operand). Enige toegestane plek = lib/household-type.ts
        // (gerichte eslint-disable).
        {
          selector:
            'BinaryExpression[operator=/^[!=]==?$/]:has(Literal[value=/^(samenwonend|getrouwd)$/]):has(Identifier[name=/^household_?[Tt]ype$/])',
          message:
            "Gebruik hasPartner(...) uit lib/household-type.ts i.p.v. household_type/householdType te vergelijken met 'samenwonend'/'getrouwd' — dat is dode vocabulaire (canoniek: 'solo'/'samen'/'gezin') die hasPartner altijd false maakte voor partners.",
        },
      ],
    },
  },
]);

export default eslintConfig;
