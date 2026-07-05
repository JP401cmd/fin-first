# E2E — Playwright UAT-skelet (domein Bezit)

Dit is een **skelet**: het demonstreert de automatiserings-weg voor de
UAT-scenario's uit `uat2-bezit.md` — het los aangeleverde UAT-BEZIT-
scenariodocument voor deze sessie (niet in dit repo opgenomen) — en, bij
uitbreiding, voor de overige deelgebieden in het wél gecommitte
`docs/uat/uat-plan.md` (Deel 2). Er is in de
ontwikkelomgeving waarin dit is opgebouwd **geen draaiende app-server, geen
admin-testsessie en geen Playwright-browser-install** beschikbaar — de tests
zijn dus (nog) niet hier uitgevoerd. Ze zijn wél syntactisch correct,
gebaseerd op de daadwerkelijke broncode (labels, aria-attributen, DOM-
structuur) en direct uitbreidbaar.

De tests zijn **geen** `test.skip()`-placeholders: ze falen zichtbaar zodra
iemand ze zonder omgeving draait (geen `UAT_BASE_URL` bereikbaar, geen
credentials) — dat is bewust, zodat de suite niet stilzwijgend "groen"
oogt zonder ooit echt te hebben gedraaid.

## Draaien

```bash
npm install
npx playwright install --with-deps chromium
UAT_BASE_URL=https://jouw-preview-of-dev-url \
UAT_ADMIN_EMAIL=admin@test.trifinity.nl \
UAT_ADMIN_PASSWORD=... \
npx playwright test --config=e2e/playwright.config.ts
```

Vereiste env-variabelen:

| Variabele | Doel |
|---|---|
| `UAT_BASE_URL` | Basis-URL van de testomgeving (default `http://localhost:3000`) |
| `UAT_ADMIN_EMAIL` | E-mailadres van een admin-testaccount (bereikt `/beheer/testdata`) |
| `UAT_ADMIN_PASSWORD` | Wachtwoord bij dat account |

**Nooit** productie-accounts of echte financiële gegevens gebruiken — zie
`docs/uat/uat-plan.md` §2.3 ("Testomgeving en herstelbare testdata"). Elke
test seedt zelf de benodigde persona via `/beheer/testdata` voordat hij
assertions doet, dus scenario's zijn onderling onafhankelijk.

## Structuur

```
e2e/
├── playwright.config.ts   — config (testDir, baseURL uit env, chromium)
├── tsconfig.json          — eigen TS-scope (root-tsconfig sluit e2e/ uit)
├── README.md              — dit bestand
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
| `components/app/quick-add-wizard/steps/step-type.tsx` (regel 63-68) | Elke type-tegel is een `<button>` met **expliciet `role="listitem"`** — dat overschrijft de impliciete "button"-rol, dus `getByRole('button', …)` matcht niets; de juiste (verrassende) rol is `listitem` | `data-testid="asset-type-<type>"` per tegel, zodat tests niet van de rol-keuze afhangen |
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
