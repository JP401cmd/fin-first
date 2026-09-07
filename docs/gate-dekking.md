# Gate-dekking — wat elke poort wél en niet vangt

**Stand: 7 september 2026.** Aanleiding: UR3-25. De maandgrens-vangrail stond op
`error`, meldde niets, en dat werd gelezen als bewijs dat er niets mis was —
terwijl hij structureel maar één van drie schrijfvormen kón zien. Vier
overtredingen glipten erdoor, waarvan één de einddatum van het maandrapport een
dag te vroeg zette.

Dat is het patroon dat dit document bestrijdt: **een gate die zwijgt bewijst
alleen dat hij niets vond in de vorm die hij kent.** Wie een poort groen ziet
staan, moet hier kunnen opzoeken wat die groene status wél en niet betekent.

**Norm.** Elke gate draagt in de kop van zijn eigen script een blok *"wat deze
gate niet dekt"*. `scripts/check-self-modification.mjs` is het model (expliciet
"geen preventie", "geen slot"); `scripts/check-heading-levels.mjs` en
`scripts/glossary/check-coverage.mjs` volgen 'm. Dit document is het overzicht
daarboven, geen vervanging: bij tegenspraak wint de scriptkop, want die staat
naast de code.

---

## 1. Wie draait wat

| Moment | Poorten |
| --- | --- |
| **`.husky/pre-push`** (elke push, lokaal) | `tsc --noEmit` (productiecode), `check:client-reads`, `check:freedom-basis`, `check:overlays`, `check:tap-targets`, `check:headings`, `page-info:check`, `glossary:check`, `check:productiecijfers`, `parity:check`, `merkstem:check`, `check:self-modification` |
| **CI — `quality-gate`** (elke push + PR) | `tsc --noEmit` (inclusief tests), `npm run lint` (ESLint), runtime-ondergrens, rekenmotor-/pariteitstests, `test/*-suite-check.test.ts`, `arch:check` |
| **CI — `bundle-budget`** | alleen op pull request |
| **CI — `e2e-smoke`** | opt-in op secrets, `continue-on-error` → **nooit gatend** |
| **Gepland (2×/week)** | `.github/workflows/litert-watch.yml` — signaalwachter, bewust niet-gatend |
| **Handmatig / ritueel** | `arch:diagram`, `uat:stale`, `herstelproef:check`, de live `/uat`-run, `POST /api/regression/run` |

Twee asymmetrieën die je moet kennen:

- **ESLint draait alleen in CI, niet pre-push.** De script-gates draaien bij de
  push, de lint-vangrails pas bij CI. Bewust (push-snelheid), maar het betekent
  dat een lint-overtreding lokaal groen voelt.
- **`tsc` draait twee keer met een andere scope.** Pre-push filtert
  testbestanden en `.next/`-fouten weg (pre-existing strict-type-ruis); CI doet
  dat niet. Een pre-push die slaagt, garandeert de CI-typecheck dus niet.

---

## 2. Per gate

### `tsc --noEmit`
- **Vangt:** typefouten in de hele boom.
- **Dekt niet:** alles wat op typeniveau klopt maar numeriek fout is — élk
  bedrag is `number`, dus drift tussen twee rekenwegen is voor de compiler
  onzichtbaar. Dat is precies waarom `check:freedom-basis` en de
  formula-drift-scan bestaan. Pre-push mist bovendien testbestanden en
  `.next/types`-fouten (bewust weggefilterd).

### `npm run lint` (ESLint) — vijf esquery-selectorgroepen + één eigen regel
- **Vangt:** huishoudtype-vocabulaire (`household_type === 'samenwonend'`), het
  afrondingsidioom `parseFloat(x.toFixed(n))`, rauwe `error.message` in een
  API-response, winst/verlies-kleur in JSX, en — sinds UR3-25 —
  `trifinity/geen-maandgrens-iso`.
- **Dekt niet:**
  - **esquery heeft geen scope-resolutie.** Een `no-restricted-syntax`-selector
    kan een binding niet van declaratie naar gebruik volgen. Elke vangrail die
    dat wél nodig heeft, moet een echte regel zijn (zoals de maandgrensregel).
    Lees dit vóór je een nieuwe selector schrijft die "de variabele-vorm ook
    even meeneemt": dat kan niet.
  - Flat config: een later config-object dat `no-restricted-syntax` opnieuw zet
    **vervangt** de eerdere lijst voor die bestanden. Alle vier de objecten in
    `eslint.config.mjs` spreiden `RESTRICTED_SYNTAX_BASE` daarom opnieuw in.
    Vergeten = een vangrail die stil uitvalt voor een hele map.
  - De regels draaien niet pre-push (zie boven).

### `trifinity/geen-maandgrens-iso` (`eslint-rules/geen-maandgrens-iso.mjs`)
- **Vangt:** een uit lokale componenten gebouwde `Date` (`new Date(jaar, maand,
  …)`, ≥ 2 argumenten) die via `toISOString()`/`toJSON()` geserialiseerd wordt —
  in de geketende vorm, de variabele-vorm (mét scope-resolutie) én de vorm met
  een lokale helper-functie.
- **Dekt niet:** `new Date()` / `new Date(isoString)` (≤ 1 argument, een echte
  timestamp); de mutatie-vorm `const d = new Date(); d.setMonth(…);
  d.toISOString()` (64 treffers in de repo, verschuiving alleen tussen 00:00 en
  02:00 lokaal — eigen kaart); een helper die uit een **ander bestand** wordt
  geïmporteerd (ESLint heeft geen cross-file scope); een binding met meerdere
  toewijzingen (bewust stil, te weinig zekerheid).
- **Bewust dom en luid:** een middag-anker (`new Date(j,m,d,12)`) verschuift
  níét maar wordt wél gemeld. Dat verdient een gerichte
  `// eslint-disable-next-line … -- <reden>`, geen uitzondering in de regel.
  Bestaande uitzonderingen: `lib/holdings-staleness.test.ts` (`atIso`),
  `lib/coach-state.test.ts` (5×), `lib/net-worth-projection.test.ts`,
  `app/test-freedom-days-monthly-trend/page.tsx`.
- **Getest:** `eslint-rules/geen-maandgrens-iso.test.mjs` (RuleTester).

### `check:client-reads` — datapad-conventie (ADR 0058)
- **Vangt:** een nieuwe read-for-display met de browser-client in een
  `'use client'`-bestand, buiten de grandfather-allowlist; plus de
  niet-allowlistbare kolomregel (`select('*')` op `assets`, `bank_accounts`,
  `bank_connection_accounts`, `bank_connections`).
- **Dekt niet:** de ~47 bestaande lezers op de allowlist. En, belangrijker: de
  kolomregel scant alleen de **letterlijke** `select('*')` ín een bestand dat
  zélf `'use client'` draagt. Dezelfde query in een gedeelde lib-helper
  (`lib/household/perspective-loader.ts`) of in een server-loader waarvan het
  resultaat als prop naar een clientcomponent gaat — Next serialiseert die prop
  volledig in de RSC-payload — blijft onzichtbaar. Beide lekken moesten met de
  hand gevonden worden. **De gate is hier een vangrail, geen dekkingsbewijs.**

### `check:freedom-basis` — vrijheidstijd-grondslag (KRUIS-20)
- **Vangt:** een nieuw zelfgerekend €→tijd-dagtarief buiten `lib/expense-rate.ts`.
- **Dekt niet:** blinde vlek (a) uit de scriptkop, die drie keer heeft
  toegeslagen in steeds een andere gedaante (mét ÷30, zónder ÷30, en zonder
  venster-afleiding). Alles is `number`; de compiler ziet niets.

### `check:overlays` — ShellOverlay-driewegregel (ADR 0039)
- **Vangt:** een nieuwe directe `<BottomSheet>`/`<SlideInPane>`, een handgerolde
  `fixed inset-0`-overlay, en een scrim met een rauwe kleur i.p.v. `var(--scrim)`
  (die derde regel is **niet** allowlistbaar).
- **Dekt niet:** de bestaande directe consumenten op de grandfather-allowlist.

### `check:tap-targets` — raakdrempel (M19)
- **Vangt:** een nieuwe icoonknop die zijn doos onder 44×44 vastzet zonder
  aantoonbaar raakgebied.
- **Dekt niet:** de werkelijke gerenderde grootte. Bewijs is een **marker in
  dezelfde openings-tag**; een raakgebied dat via een wrapper of een berekende
  klasse ontstaat, telt niet als bewijs en een te kleine knop die zijn maat uit
  een variabele haalt evenmin. Variant-geprefixte maten (`md:h-11`) tellen
  bewust niet mee.

### `check:headings` — koppencontract (M28 / ADR 0110)
- **Vangt:** een nieuwe literale `<h1>` in `app/(app)/**` of `components/**`, en
  elke `level="h1"`.
- **Dekt niet:** de gerenderde koppen**volgorde**. Die ontstaat pas in de DOM uit
  drie bomen (shell + pagina + overlay) en is statisch niet te bepalen; dat is
  een axe-`heading-order`-toets in de UAT-laag. De gate vangt dus te véél
  koppen en niet een **ontbrekende** — daardoor is de check-in zonder paginanaam
  nooit opgevallen.

### `page-info:check` en `glossary:check`
- **Vangen:** een `getPageInfo('key')` / `infoKey` / `<GlossaryTerm term="…">`
  die naar een niet-bestaande sleutel wijst, en een route zonder `i`-knop.
- **Dekken niet:** een sleutel die via een **berekende** (niet-literale) string
  wordt doorgegeven — die blijft onzichtbaar. Een wees-sleutel is bewust alleen
  een waarschuwing (exit 0), zodat nieuw jargon eerst mag landen.

### `check:productiecijfers` (ADR 0111)
- **Vangt:** productiegegevens in `supabase/migrations/**` en `docs/adr/**`.
- **Dekt niet:** de rest van de repo. Het gaat om de twee plekken waar we ons
  huiswerk opschrijven, niet om een repo-brede PII-scan.

### `parity:check` — lokale-prompt-parity (ADR 0062)
- **Vangt:** de bron-DNA (`lib/ai/dna/base.ts` + `wil.ts`) is gewijzigd zonder
  dat `LOCAL_CHAT_DNA` opnieuw gecondenseerd/gebaselined is (sha256 tegen
  `parity-manifest.json`).
- **Dekt niet:** of de hercondensatie *inhoudelijk* klopt. Een groene hash zegt
  alleen dat iemand opnieuw gebaselined heeft, niet dat de lokale Fin hetzelfde
  antwoordt. De review daarop is de `lokale-prompt-parity`-skill.

### `merkstem:check` (ADR 0112)
- **Vangt (hard):** de toon-/claimbron is gewijzigd zonder herattestatie.
  **(zacht):** de copy zelf is bewogen — waarschuwing, geen blokkade.
- **Dekt niet:** of de copy *goed* is. Het is een attestatie ("op datum X naast
  de bron gelegd"), geen inhoudelijk oordeel. Let op de bekende valkuil: de
  extractie liet claim-dragende copy in zijn geheel wegvallen zolang er een
  `{' '}` naast stond — de poort stond groen over echte drift. Zijn eigen tests
  draaien daarom mee in CI (`scripts/merkstem`).

### `check:self-modification` (.claude/)
- **Vangt:** een te pushen commit die de eigen agent-/skill-/command-definities
  raakt zonder `self-improve:`-onderwerp.
- **Dekt niet:** **geen preventie, geen slot.** Hij verhindert de edit niet, hij
  maakt hem zichtbaar op het moment van pushen. Dit is het model voor hoe een
  gate zijn eigen grens hoort op te schrijven.

### `arch:check` — architectuurfeiten-versheid
- **Vangt:** een gecommitte `docs/architecture/architecture.json` die
  structureel achterloopt op de code (nieuwe tabel/route/module/integratie).
- **Dekt niet:** de **gecureerde** betekenis (`archimate-model.ts`,
  `hld-model.ts`, `calculations.ts`, `development-model.ts`) — die wordt door
  vitest bewaakt, niet door deze scan. En: er is **géén in-repo cron** die
  `arch:diagram` draait; de versheid hangt aan een externe Cowork-taak. Loopt
  die niet meer, dan verschuift dit van "vers" naar "stil verouderd".

### Rekenmotor- & pariteitstests (CI-vitest)
- **Vangen:** de FIRE/Horizon-kernel, de Excel-oracle-pariteit, de fiscale
  motoren, de architectuur-curatie, en de poorten-over-de-poorten
  (`scripts/merkstem`, `scripts/ai-parity`, `scripts/page-info`,
  `scripts/litert`, `test/uat-stale-scan.test.ts`).
- **Dekken niet:** de in-app regressiesuites die **DB, netwerk of een sessie**
  nodig hebben (onboarding-api-flow, security-auth, kern-api-routes). Die
  draaien uitsluitend via de server-runner (`/beheer/regressietest` of
  `POST /api/regression/run` tegen een lopende dev-server + seed). Alleen de
  pure suites hebben een `test/*-suite-check.test.ts`-wrapper in CI. Bekende,
  nog niet opgeloste suite-drift staat in
  `test/helpers/regression-known-failures.ts` — die lijst mag alleen krimpen.

### `bundle-budget`, `e2e-smoke`, `litert-watch`
- **`bundle-budget`** draait alleen op pull request en gate't tegen een
  ratchet-baseline; **zolang `scripts/perf/route-sizes.baseline.json` ontbreekt
  is hij report-only (exit 0)**. Een groene PR bewijst dan niets over bundelmaat.
- **`e2e-smoke`** is `continue-on-error` en slaat zichzelf over zonder secrets:
  **nooit gatend**, ook niet wanneer hij rood is.
- **`litert-watch`** is een upstream-signaalwachter, geen kwaliteitspoort: zijn
  niet-nul exit is het signaal, hij heeft netwerk nodig, en zijn uitkomst
  verandert zonder dat de repo verandert.

---

## 3. Krimpende lijsten (geen open allowlists)

Zes gates dragen een RESIDUE-/allowlist-mechanisme. De conventie is app-breed:
**zo'n lijst mag alleen krimpen** — een entry die geen overtreding meer is,
maakt de gate hard rood. Dat is bewust: een allowlist die mag groeien is geen
gate maar een logboek. Per september 2026 draaien `check:client-reads`,
`check:freedom-basis`, `check:overlays`, `check:tap-targets`, `check:headings`
en `check:productiecijfers` groen zonder verouderde entries.

## 4. Wat nergens gatend draait

- `herstelproef:check` — kwartaalritueel, handmatig.
- `uat:stale` en de live `/uat`-run — release-pijplijn, handmatig.
- `arch:diagram` — handmatig of via een externe taak; zie hierboven.
- De DB-/sessie-afhankelijke regressiesuites — server-runner.
- **Wft-/compliance-toetsing van nieuwe publieke tekst** — dat is een
  skill-route (`compliance-check`, `merkstem`), geen script. `merkstem:check`
  bewaakt alleen dát er geattesteerd is.
