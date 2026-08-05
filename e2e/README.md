# E2E — Playwright (auth-smoke + UAT-skelet domein Bezit)

Twee soorten specs delen deze config:

1. **`smoke.spec.ts`** (root van deze map) — kale, persona-onafhankelijke
   auth-smoke: login → `/overzicht` → een tweede beveiligde route, plus het
   negatieve geval (uitgelogd op een beveiligde route → redirect naar
   `/login`). Geen testdata-seed nodig, dus lichter en sneller dan de
   UAT-specs. Dit dekt de kaart "Één Playwright smoke-spec (login →
   dashboard → beveiligde route)".
2. **`uat/*.spec.ts`** — een **skelet**: het demonstreert de automatiserings-
   weg voor de UAT-scenario's uit `uat2-bezit.md` — het los aangeleverde
   UAT-BEZIT-scenariodocument voor deze sessie (niet in dit repo opgenomen)
   — en, bij uitbreiding, voor de overige deelgebieden in het wél gecommitte
   `docs/uat/uat-plan.md` (Deel 2).

Er is in de ontwikkelomgeving waarin dit is opgebouwd **geen draaiende
app-server, geen testsessie en geen Playwright-browser-install** beschikbaar
— geen van beide specs is hier daadwerkelijk uitgevoerd. Ze zijn wél
syntactisch correct en type-checken (`npx tsc -p e2e/tsconfig.json --noEmit`),
gebaseerd op de daadwerkelijke broncode (labels, aria-attributen, DOM-
structuur, `lib/supabase/proxy.ts`-route-lijst) en direct uitbreidbaar.

De tests zijn **geen** `test.skip()`-placeholders zonder reden: ze falen (of
skippen mét duidelijke melding, zie hieronder) zichtbaar zodra iemand ze
zonder omgeving draait — dat is bewust, zodat de suite niet stilzwijgend
"groen" oogt zonder ooit echt te hebben gedraaid.

## Draaien — smoke.spec.ts (auth-smoke)

```bash
npm install
npx playwright install --with-deps chromium
UAT_BASE_URL=https://jouw-preview-of-dev-url \
REGRESSION_TEST_EMAIL=regression-test@fintwo.nl \
REGRESSION_TEST_PASSWORD=... \
npm run test:e2e -- smoke.spec.ts
```

Ontbreken `REGRESSION_TEST_EMAIL`/`REGRESSION_TEST_PASSWORD`? Dan **skipt**
de spec met een expliciete melding (`test.skip(...)`) in plaats van te falen
of stil te slagen — bewust anders dan de UAT-specs hieronder, omdat dit een
kaal, herbruikbaar auth-account is (geen admin, geen persona-seed) dat in
veel meer omgevingen wél beschikbaar zou moeten zijn.

## Draaien — uat/*.spec.ts (UAT-skelet)

```bash
npm install
npx playwright install --with-deps chromium
UAT_BASE_URL=https://jouw-preview-of-dev-url \
UAT_ADMIN_EMAIL=admin@test.trifinity.nl \
UAT_ADMIN_PASSWORD=... \
npx playwright test --config=e2e/playwright.config.ts uat/
```

Vereiste env-variabelen:

| Variabele | Doel |
|---|---|
| `UAT_BASE_URL` | Basis-URL van de testomgeving (default `http://localhost:3000`) |
| `UAT_ADMIN_EMAIL` | E-mailadres van een admin-testaccount (bereikt `/beheer/testdata`) — alleen voor `uat/*.spec.ts` |
| `UAT_ADMIN_PASSWORD` | Wachtwoord bij dat account — alleen voor `uat/*.spec.ts` |
| `REGRESSION_TEST_EMAIL` | E-mailadres van het bestaande, niet-admin regressie-testaccount — alleen voor `smoke.spec.ts` |
| `REGRESSION_TEST_PASSWORD` | Wachtwoord bij dat account — alleen voor `smoke.spec.ts` |

**Nooit** productie-accounts of echte financiële gegevens gebruiken — zie
`docs/uat/uat-plan.md` §2.3 ("Testomgeving en herstelbare testdata"). Elke
UAT-test seedt zelf de benodigde persona via `/beheer/testdata` voordat hij
assertions doet, dus scenario's zijn onderling onafhankelijk; de auth-smoke
seedt niets (read-only).

## CI

`.github/workflows/ci.yml` bevat een `e2e-smoke`-job die **opt-in en
niet-gatend** is (`continue-on-error: true`): hij draait alleen wanneer vier
repo-secrets zijn geconfigureerd (menselijk-gated, nog niet gezet):

- `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` — een **test**-Supabase-
  project (nooit productie)
- `REGRESSION_TEST_EMAIL` / `REGRESSION_TEST_PASSWORD` — hetzelfde
  testaccount als hierboven

Ontbreken deze secrets (bv. op een fork-PR, of tot iemand ze instelt), dan
zet een guard-stap `configured=false` en worden alle vervolgstappen
overgeslagen — de job slaagt triviaal en blokkeert nooit een merge. Zodra
een hermetische/hosted test-Supabase-omgeving bestaat, is de vervolgstap om
dit naar een echte, gatende CI-stap te promoveren (`continue-on-error` eraf).
De job draait alleen `smoke.spec.ts`, niet de zwaardere `uat/*.spec.ts`
(die blijven lokaal/menselijk-gated).

## Structuur

```
e2e/
├── playwright.config.ts   — config (testDir: '.', baseURL uit env, chromium)
├── tsconfig.json          — eigen TS-scope (root-tsconfig sluit e2e/ uit)
├── README.md              — dit bestand
├── smoke.spec.ts          — auth-smoke: login → /overzicht → beveiligde route
└── uat/
    ├── helpers.ts         — loginAsAdmin / seedPersona / readFiguresStrip / parseEuroAmount
    └── bezit.spec.ts      — UAT-BEZIT-01 / 05 / 06 / 08 / 10
```

Waarom niet in de root-`tsconfig.json`/eslint-config meegenomen:
`@playwright/test` staat in `devDependencies` maar is (nog) niet
geïnstalleerd in elke omgeving die dit repo checkt. De root `tsconfig.json`
sluit `e2e` daarom expliciet uit (`exclude`), en `eslint.config.mjs` negeert
`e2e/**` via `globalIgnores` — beide additieve, minimale wijzigingen (zie
onderaan dit bestand voor de exacte diffs). `e2e/tsconfig.json` geeft de map
een eigen, losstaande TS-project-scope voor wie 'm wél wil type-checken:

```bash
npx tsc -p e2e/tsconfig.json --noEmit
```

## Uitbreiden

Volg hetzelfde patroon voor een volgend UAT-deelgebied: nieuw bestand
`e2e/uat/<domein>.spec.ts`, hergebruik `helpers.ts` waar mogelijk (of breid
het uit — bv. een `openAssetTypePicker(page, label)`-helper zodra méér
specs door de QuickAdd-wizard heen moeten), en zet de scenario-ID
(`UAT-<DOMEIN>-NN`) in elke `test.describe`-titel zodat de koppeling met
`docs/uat/uat-plan.md` §2.9 (traceability-matrix) navolgbaar blijft.

## Resultaatformat

Bij het daadwerkelijk uitvoeren van een ronde: registreer resultaten volgens
`docs/uat/uat-plan.md` §2.5 (Status/Faalstap/Severity/Opmerking/
Frictie-UX-observatie/Registratie) — dat format leeft in het testplan, niet
in deze suite. Playwright's eigen HTML-reporter (`playwright-report/`, zie
`playwright.config.ts`) is een aanvullend, geen vervangend bewijsstuk.

## Ontbrekende `data-testid`'s (gevonden tijdens het bouwen van dit skelet)

Elke regel hieronder staat ook als `// TODO test-id:`-comment op de
betreffende plek in `bezit.spec.ts` of `helpers.ts`. Geen van deze is een
harde blocker — de huidige locators (rol/label/tekst) werken, maar zijn
gevoelig voor copy-wijzigingen of (in twee gevallen) een echte a11y-hiaat.

| Plek | Probleem | Aanbevolen fix |
|---|---|---|
| `components/app/persona-card.tsx` | Geen `data-testid` per persona; de "Laden als \<voornaam\>"-knop breekt stilzwijgend als een persona-naam wijzigt in `lib/test-personas.ts` | `data-testid="persona-card-<key>"` op de kaart, of op de CTA-knop |
| `components/app/quick-add-wizard/steps/step-type.tsx` (type-grid) | Elke type-tegel is een gewone `<button>` in een `role="group"`-container — `getByRole('button', { name: … })` werkt (het a11y-gat met `role="listitem"` op de button is gefixt). Resteert: de locator hangt aan de zichtbare label-tekst | `data-testid="asset-type-<type>"` per tegel, zodat tests niet van de copy afhangen |
| `components/app/quick-add-wizard/steps/step-details.tsx` (submit-knop) | `submitLabel` default is `'Toevoegen'` maar is per call-site overschrijfbaar — een tekst-locator is dus impliciet aan de aanroeper gekoppeld | `data-testid="quick-add-submit"` op de submit-knop |
| `components/app/core/assets/asset-pane.tsx` / `components/core/assets-client.tsx` | Asset-kaarten hebben geen `data-testid="asset-card-<id>"` — alleen tekstmatch op de naam mogelijk | `data-testid="asset-card-<id>"` op elke kaart |
| `components/app/shell/slide-in-pane.tsx` (regel 227-234) | De ←-terugknop krijgt **ook** `aria-label="Sluiten"` wanneer geen `onBack` is meegegeven (fallback op `onClose`) — samen met de losse ✕-knop (regel 258-265, ook `aria-label="Sluiten"`) staan er dan TWEE gelijknamige knoppen in de pane-header | `data-testid="pane-close"` op de ✕-knop, zodat "sluiten" niet via tekst hoeft te disambigueren |
| `components/core/assets-client.tsx` — `ValuationModal` (regel 4188/4197/4212) | De labels "Datum" / "Nieuwe waarde" / "Notitie (optioneel)" hebben **geen** `htmlFor`/wrapping-koppeling met hun `<input>` — een echt a11y-gat (schermlezers kunnen het veld niet aan het label koppelen), niet alleen een testgemak | `htmlFor`/`id` toevoegen (lost zowel a11y als `getByLabel()`-bruikbaarheid op), plus `data-testid="valuation-new-value"` e.d. |
| `components/core/assets-client.tsx` — `ValuationModal` als geheel | Draait als "sibling sheet" naast de nog gemounte asset-pane — beide zijn `role="dialog"` en bevatten toevallig allebei de tekst "Herwaarderen", dus `hasText`-filtering is niet uniek (`.last()` gebruikt als workaround) | `data-testid="valuation-modal"` op de BottomSheet-wrapper |

## Bekende gate-beslissing

De root-`tsconfig.json` en `eslint.config.mjs` zijn additief aangepast (zie
git-diff) om `e2e/**` uit te sluiten — dit was nodig omdat de root-tsconfig
`**/*.ts` include't zonder scoping naar `app/`/`components/`/`lib/`, en
`@playwright/test` (devDependency, nog niet geïnstalleerd in elke checkout)
anders de hoofd-`tsc --noEmit` zou breken. Zie de projectbrief voor de
volledige motivatie.
