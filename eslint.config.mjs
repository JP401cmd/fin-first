import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Gedeelde no-restricted-syntax-selectors. Flat config: een later object dat
// dezelfde regel zet VERVANGT de eerdere config voor die bestanden — daarom
// zijn de basis-selectors hier los gedefinieerd en spreiden beide regel-
// objecten ze opnieuw in, zodat de P&L-vangrails (alleen components/ +
// app/(app)/) de tijdzone- en household-vangrails niet uitschakelen.
const RESTRICTED_SYNTAX_BASE = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.name="toISOString"][callee.object.type="NewExpression"][callee.object.callee.name="Date"][callee.object.arguments.length>=2]',
    message:
      "Gebruik lib/month-range.ts (localMonthBounds / localMonthStart / localMonthStartMonthsAgo) i.p.v. new Date(jaar, maand, …).toISOString() — die schuift de maandgrens in NL een dag terug.",
  },
  {
    selector:
      'BinaryExpression[operator=/^[!=]==?$/]:has(Literal[value=/^(samenwonend|getrouwd)$/]):has(Identifier[name=/^household_?[Tt]ype$/])',
    message:
      "Gebruik hasPartner(...) uit lib/household-type.ts i.p.v. household_type/householdType te vergelijken met 'samenwonend'/'getrouwd' — dat is dode vocabulaire (canoniek: 'solo'/'samen'/'gezin') die hasPartner altijd false maakte voor partners.",
  },
];

// Winst/verlies-kleur-vangrails (kleurconsistentie-kaart, jul 2026): de
// semantische tokens --positive/--negative (globals.css) zijn dé bron voor
// P&L-kleur. Twee NAUWE regels (bewust géén brede className-ban — rood/groen
// draagt hier óók status-, fout-, favoriet-, box- en categorie-betekenis):
//
// 1. Hex-ban in JSX: de exacte groen/rood-hexen die --positive/--negative
//    dupliceren mogen niet als literal in JSX voorkomen (fill/stroke/style/
//    className-arbitrary). Continue kleurschalen (lerp-heatmaps), serie-
//    paletten en kleur-pickers zijn legitiem → gerichte eslint-disable met
//    reden, net als bij de tijdzone-vangrail.
// 2. P&L-ternary-ban: `cond ? 'text-emerald-…' : 'text-red-…'` (beide
//    volgordes) is dé winst/verlies-signatuur → gebruik text-positive/
//    text-negative. Stoplicht-drietrappen (emerald/amber/red, geneste
//    ternary) matchen bewust niet, en ternaries op een success-conditie
//    (`x === 'success'`, `path.success`) evenmin — dat zijn statusbanners
//    (gelukt/mislukt), geen winst/verlies.
const RESTRICTED_SYNTAX_PNL = [
  {
    selector:
      "JSXAttribute Literal[value=/#(10b981|22c55e|16a34a|059669|ef4444|dc2626|f87171)/], JSXAttribute TemplateElement[value.raw=/#(10b981|22c55e|16a34a|059669|ef4444|dc2626|f87171)/]",
    message:
      "Winst/verlies-hex in JSX: gebruik var(--positive)/var(--negative) (of text-positive/text-negative) i.p.v. deze groen/rood-hex. Legitiem niet-P&L-gebruik (kleurschaal, serie-palet, picker)? Zet een gerichte eslint-disable met reden.",
  },
  {
    selector:
      'ConditionalExpression[consequent.value=/\\btext-(emerald|green)-/][alternate.value=/\\btext-red-/]:not(:has(Literal[value="success"], Identifier[name="success"])), ConditionalExpression[consequent.value=/\\btext-red-/][alternate.value=/\\btext-(emerald|green)-/]:not(:has(Literal[value="success"], Identifier[name="success"]))',
    message:
      "Winst/verlies-ternary: gebruik text-positive/text-negative (semantische tokens) i.p.v. raw text-emerald/green/red. Echt geen P&L (bv. status)? Zet een gerichte eslint-disable met reden.",
  },
];

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
    // Playwright E2E-skelet: eigen tsconfig-scope (zie e2e/tsconfig.json),
    // draait tegen @playwright/test dat niet overal geïnstalleerd is.
    "e2e/**",
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
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX_BASE],
    },
  },
  {
    // Winst/verlies-kleur-vangrails: alleen echte app-UI (components/ +
    // app/(app)/). De wegwerp-testpagina's (app/test-*) en losse libs vallen
    // bewust buiten scope. Basis-selectors opnieuw meespreiden (zie boven).
    files: ["components/**/*.{ts,tsx}", "app/(app)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        ...RESTRICTED_SYNTAX_PNL,
      ],
    },
  },
]);

export default eslintConfig;
