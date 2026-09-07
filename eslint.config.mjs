import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { geenMaandgrensIso } from "./eslint-rules/geen-maandgrens-iso.mjs";

// Lokale plugin. Eén regel, in een eigen module omdat hij scope-resolutie doet
// (en dus met RuleTester te testen moet zijn — zie
// eslint-rules/geen-maandgrens-iso.test.mjs).
const trifinityPlugin = {
  rules: { "geen-maandgrens-iso": geenMaandgrensIso },
};

// Gedeelde no-restricted-syntax-selectors. Flat config: een later object dat
// dezelfde regel zet VERVANGT de eerdere config voor die bestanden — daarom
// zijn de basis-selectors hier los gedefinieerd en spreiden beide regel-
// objecten ze opnieuw in, zodat de P&L-vangrails (alleen components/ +
// app/(app)/) de tijdzone- en household-vangrails niet uitschakelen.
//
// LET OP — de tijdzone-/maandgrensvangrail stond hier tot 7 sep 2026 als
// selector [0] en is VERHUISD naar de eigen regel
// `trifinity/geen-maandgrens-iso` (UR3-25). Reden: de selector eiste
// `callee.object.type="NewExpression"` en kende daarmee maar één schrijfvorm;
// esquery heeft geen scope-resolutie, dus de variabele-vorm was met géén
// enkele selector te vangen. Niet terugzetten — dat geeft dubbele meldingen.
const RESTRICTED_SYNTAX_BASE = [
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
// ── Arch F2 — lint-vangrails tegen drift (architectuurreview 3 jul 2026,
// bevinding #22) ─────────────────────────────────────────────────────────
//
// Klasse (2) — AFRONDINGSIDIOOM. `parseFloat(x.toFixed(n))` rondt af via een
// string-omweg: het verliest precisie en omzeilt de (nog te bouwen) centrale
// afrondingshelper. Gescoped op app/**+components/** (de engines in lib/ mogen
// afronden). Zeer schone AST-signatuur → nagenoeg nul false positives. De
// bestaande treffers (36 in 3 holdings/dividends-routes) dragen een gerichte
// eslint-disable met verwijzing naar de F4-kaart 'centrale afrondingshelpers'
// tot die helper (roundCents/roundEuro) bestaat.
const RESTRICTED_SYNTAX_ROUND = [
  {
    selector:
      'CallExpression[callee.name="parseFloat"] > CallExpression[callee.property.name="toFixed"]',
    message:
      "parseFloat(x.toFixed(n)) rondt af via een string-omweg (precisieverlies) en omzeilt de centrale afronding. Gebruik de centrale helper (roundCents/roundEuro, [Arch F4] centrale afrondingshelpers). Tijdelijk bewust? // eslint-disable-next-line no-restricted-syntax -- zie [Arch F4] centrale afrondingshelpers.",
  },
];

// Klasse (1) — ERROR.MESSAGE-LEK. Een rauwe `error.message`/`err.message` in de
// body van een `NextResponse.json(...)`/`Response.json(...)`-call lekt interne
// DB-/driverdetails naar de client (AVG/security). Gescoped op app/api/**.
// Canoniek alternatief: `serverError(err, 'domein:METHOD')` uit
// lib/api/respond.ts (ADR 0044) — logt server-side, stuurt een generieke tekst.
// Selector: een `.message`-access op een error-identifier (err/error/e, of een
// naam die op 'Error' eindigt) ergens binnen een `.json(...)`-call. Curated,
// client-veilige `.message`-velden (linkCheck.message, RPC body.error.message)
// matchen bewust NIET (object is geen error-identifier). Vanwege de resterende
// false-positive-ruis start dit als error MÉT gerichte suppressions op de
// bestaande sites tot de F4-envelope-kaart ze migreert.
const API_MSG_LEAK =
  "Rauwe error.message naar de client lekt interne (DB-/driver)details (AVG). Gebruik serverError(err, 'domein:METHOD') uit lib/api/respond.ts (ADR 0044). Echt een curated, client-veilige melding? // eslint-disable-next-line no-restricted-syntax -- zie [Arch F4] API-error-envelope.";
const RESTRICTED_SYNTAX_API_MSG = [
  {
    // Directe identifier: `{ error: err.message }` / `error.message` / `e.message`
    // of een naam die op 'Error' eindigt.
    selector:
      'CallExpression[callee.property.name="json"] MemberExpression[property.name="message"][object.name=/^(err|error|e)$|Error$/]',
    message: API_MSG_LEAK,
  },
  {
    // Cast-vorm: `(err as Error).message` — het object is dan een TSAsExpression,
    // geen Identifier, dus de bovenstaande selector mist 'm. Matcht een cast van
    // een error-identifier (err/error/e).
    selector:
      'CallExpression[callee.property.name="json"] MemberExpression[property.name="message"][object.type="TSAsExpression"][object.expression.name=/^(err|error|e)$/]',
    message: API_MSG_LEAK,
  },
];

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
    plugins: { trifinity: trifinityPlugin },
    rules: {
      // Tijdzone-/maandgrensvangrail met scope-resolutie (UR3-25, 7 sep 2026).
      // Vervangt de oude esquery-selector, die alleen de geketende
      // `new Date(j,m,d).toISOString()` kende. Deze regel lost de ontvanger op
      // en vangt óók de variabele-vorm (`const d = new Date(j,m,1);
      // d.toISOString()`) en de lokale functie-vorm (`at(j,m,d).toISOString()`).
      // Severity = "error": elke NIEUWE occurrence blokkeert. Wat hij bewust
      // NIET dekt staat in de regelkop en in docs/gate-dekking.md.
      "trifinity/geen-maandgrens-iso": "error",
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
    // Arch F2 klasse (2) — afrondingsidioom: heel app/** + components/** (de
    // app-UI én de API-routes; lib/-engines mogen afronden). Flat config: dit
    // object VERVANGT `no-restricted-syntax` voor deze bestanden, dus de basis-
    // selectors moeten opnieuw mee (anders vallen TZ/household-vangrails weg).
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        ...RESTRICTED_SYNTAX_ROUND,
      ],
    },
  },
  {
    // Winst/verlies-kleur-vangrails: alleen echte app-UI (components/ +
    // app/(app)/). De wegwerp-testpagina's (app/test-*) en losse libs vallen
    // bewust buiten scope. Staat NA het afrondings-object zodat het voor deze
    // engere scope wint; alle eerdere selectors opnieuw meespreiden (zie boven).
    files: ["components/**/*.{ts,tsx}", "app/(app)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        ...RESTRICTED_SYNTAX_ROUND,
        ...RESTRICTED_SYNTAX_PNL,
      ],
    },
  },
  {
    // Arch F2 klasse (1) — error.message-lek: alleen API-routes (app/api/**).
    // Staat als laatste zodat het voor deze scope wint; basis- én afrondings-
    // selectors opnieuw meespreiden zodat die hier óók blijven gelden.
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        ...RESTRICTED_SYNTAX_ROUND,
        ...RESTRICTED_SYNTAX_API_MSG,
      ],
    },
  },
]);

export default eslintConfig;
