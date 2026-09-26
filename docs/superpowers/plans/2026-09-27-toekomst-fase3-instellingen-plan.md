# Fase 3 — katern Instellingen: één ingang per instelling (bouwplan)

Datum: 27 september 2026 · Skill: `extend-feature` · Bron: ADR 0179 (D4, D6, amendementen), spec
`docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-design.md` §4.2 (5, 8), §4.3, §4.4, §4.5,
§4.7, §4.9, §5, §7.5, §7.7, §9 fase 3, §11 (#2, #4, #8), en de kopij-toets.

Eigenaarsbesluit van 26 sep (laat): de levensgebeurtenissen staan in katern Plan (`/toekomst#gebeurtenissen`).
Sectie "II · Gebeurtenissen" uit het wireframe vervalt. De rest van dit plan nummert daarom I · II · III.

## 0. Doelbeeld

```
Instellingen
  [wizard-ingang: Je voorkeuren voor je plan instellen · N van M bevestigd    Verder →]

  I · JE PLAN
  Stopmoment ······························ zo vroeg als het kan            ✎   ?rij=stopmoment
  Tot welke leeftijd, en wat blijft over ··· tot je 90e · niets             ✎   ?rij=eindleeftijd
  Onttrekking ····························· afnemend                        ✎   ?rij=onttrekking
  Uitgave na pensioen ····················· essentiële budgetten · € …/jr  ✎   ?rij=uitgave-na-pensioen
  [Eenvoudig: DepthSection "Meer over je plan", ingeklapt met leesregel]
  Geen tekort-lening ······················ aan · rente 5 %                ✎   ?rij=geen-tekort-lening
  Onttrekkingsvolgorde ···················· spaargeld → beleggingen → …    ✎   ?rij=onttrekkingsvolgorde
  Verdeling bij toename ··················· naar beleggingen               ✎   ?rij=verdeling-toename
  Onttrekking bij afname ·················· spaargeld → …                  ✎   ?rij=onttrekking-afname

  II · LEVENSSTRATEGIEËN (beide modi, alle vier — UAT-TOEK-42)
  AOW ✎ ?rij=aow · Pensioen ✎ ?rij=pensioen · Werk ✎ ?rij=werk · Eigen woning ✎ ?rij=huis

  III · MARKTAANNAMES (Volledig open; Eenvoudig DepthSection, ADR 0026 / TOE-3)
  Inflatie ✎ ?rij=inflatie   ↳ Wat doet inflatie met je plan? → /toekomst/inflatie-koopkracht
  Rendement ✎ ?rij=rendement · Effectief SWR (afgeleid, geen ✎) · Box 3-methode ✎ ?rij=box3
```

- Elke ✎ opent de **bestaande** body in een `ShellOverlay` (`pane` of `sheet`). Nooit een tweede formulier.
- Eén `open`-state in het katern: er staat hoogstens één overlay open (D4).
- Elke editor draagt de verschilregel `FireDeltaFooter` uit `runRegelProjection(snapshot)` tegen
  `runRegelProjection(snapshot, RegelSimOverride)`: dezelfde override-run als de wizard.
- Rijwaarden noemen geen getal dat de kop al zegt (Stopmoment zonder de opgeloste leeftijd, §4.9).
- "Alleen Volledig" voor Marktaannames wordt `DepthSection` in Eenvoudig, niet `HideInSimple`. Reden: ADR 0026
  (aanvulling fase 3-5) en de vijf verwijzers die in Eenvoudig dood liepen (commentaar in `voorkeuren-view.tsx`).
  Een `?rij=inflatie`-deeplink opent de sheet in beide modi. Hetzelfde geldt voor Geen tekort-lening en de
  pot-regels (§4.7 "nee ★"): de tekort-lening-melding linkt ernaar, dus hard verbergen zou een dode link maken.
- Geen nieuwe DB-velden. `veld-register.test.ts` blijft ongewijzigd groen. Wel een additief veld op
  `RegelSimOverride` (`potRules`), zie stap 2. Dat is een override van een bestaande kolom, geen nieuw veld.

## 1. Stand van de code (recon 27 sep)

| Onderdeel | Waar | Stand |
|---|---|---|
| Instellingen-page | `app/(app)/toekomst/(katern)/instellingen/page.tsx` | Laadt horizon-bundel, review-voortgang, dashboard-bundel (`regelSimSnapshot`, `regelVoorkeuren`, `simRows`). Rendert `InstellingenKatern`. **Ongecommit gewijzigd door NP** (gebeurtenissen eruit). |
| Katern | `components/toekomst/instellingen/instellingen-katern.tsx` | Wizard-ingang + `VoorkeurenView` onder anker `#voorkeuren`. **Ongecommit gewijzigd door NP.** |
| Voorkeuren | `components/future/voorkeuren-view.tsx` (636 r.) | Kaarten: Eindstrategie + Onttrekkingsstrategie (`RegelBewerkenPane`), 3 pot-regels (DepthSection in Eenvoudig), `LevensstrategieenSection` + `StrategieEditors`, markt-aannames (`VoorkeurBewerkenSheet` zónder snapshot, `Box3MethodeSheet` zónder snapshot, Effectief SWR read-only), `AfbouwOverzichtCard` (HideInSimple). Deeplinks `?strategie=` en `?regel=` via twee losse `useEenmaligeDeeplink`. S6: `?strategie=pensioen` opent de factor-A-uitvraag. |
| Regel-bodies | `components/future/regels/*`, `REGEL_BODIES` | Eindstrategie (`StopPlanVragen` + niet-liquide + geen tekort-lening `#geen-tekort-lening` + rente) en Onttrekkingsstrategie publiceren `FireDeltaFooter`. De drie pot-regel-bodies zijn "illustratief", **zonder verschilregel**. |
| Wizard-editors | `components/future/plan-review/editors.tsx` (`PLAN_REVIEW_EDITORS`), `laag2-editors.tsx` (`PLAN_REVIEW_LAAG2_EDITORS`) | plan → `EindstrategieBody`; uitgaven → `UitgavenEditor`; inkomsten → AOW/Werk/Pensioen-bodies (impact `kern`); woning → `HousingStrategySection` (host-modus, **geen verschilregel**) + verkoop; potten → `REGEL_BODIES`; laag 2 → `VoorkeurBewerkenBody`/`Box3MethodeBody` (met snapshot, verschilregel). |
| Verschilregel | `components/future/regels/shared.tsx#FireDeltaFooter` + `fireFooterSleutel` | Via `RegelEditActionsState.footerInfo`. `ShellOverlay kind="pane"` toont `footerInfo`; de sheets (`VoorkeurBewerkenSheet`, `Box3MethodeSheet`) tonen hem **niet**; `StrategieFooter` ook niet. |
| Strategie-editors | `components/future/strategie/*` | Hosts `AowStrategieEditor`/`WerkStrategieEditor`/`PensioenStrategieEditor` met impact `preview` (`previewFireAge`, inline "nu → concept"), chrome `StrategieModalShell` = **directe `BottomSheet`** (op de overlay-allowlist). Huis: `HousingStrategySection` met eigen inline-opslaan. |
| StrategieModal | `components/app/horizon/strategie-modal.tsx` (1515 r.) | Zie §3. Enige opener: `doelen-lab.tsx:162` "Je plan-keuzes →" (`setActiveModal('strategie')`). Mount in `toekomst-overlays.tsx:382`. Leest zelf data client-side (op de `check:client-reads`-allowlist). Deeplinks `?strategie=open`/`?modal=strategie` redirecten al (next.config) naar `?regel=eindstrategie`. |
| Uitgaven na pensioen | `components/app/horizon/uitgaven-pane.tsx` + `app/(app)/horizon/uitgaven-na-pensioen/uitgaven-client.tsx` | KPI 4 (`plan-kpi-strip.tsx:264`, `openRetirementExpensePane`) en `?uitgaven=open` openen de pane op Plan. Huishoudweergave opent `HouseholdRetirementPane`. |
| Meldingen | `lib/horizon/katern-meldingen.ts` | Acties via `instellingenRegelHref('eindstrategie')` (tekort-lening, stopmoment), `EINDSITUATIE_INSTELLING_HREF`, `AOW_ONTBREEKT_COPY.actieHref`, `strategieHref('huis')`. Commentaar r. 234: "de `?rij=`-sleutel komt in fase 3". |
| Redirects | `next.config.ts` r. 265-395 | `?strategie=open`, `?modal=strategie`, `/horizon/strategie` → `?regel=eindstrategie`; `?modal=withdrawal` → `?regel=onttrekkingsstrategie`; `/toekomst/strategie?focus=` → `?strategie=:focus`; `/horizon|toekomst/uitgaven-na-pensioen` → `/toekomst?uitgaven=open`. |
| Canvas | `components/toekomst/canvas/*` | Compact op desktop en alleen de kop op mobiel in Instellingen: **al gebouwd** (fase 2). Hier niets. |

## 2. Deeplinks oud → nieuw

`?rij=<sleutel>` is de enige sleutel die de app zelf nog uitstuurt. De oude sleutels blijven voor altijd
**aliassen**: bladwijzers, verstuurde briefingmails, opgeslagen notificaties en Fin-antwoorden bevatten ze.
De aliassen worden client-side opgelost, niet via een redirect, dus er is geen dubbele hop. Eén hook leest
`rij`, `regel` en `strategie` samen en ruimt ze in **één** `router.replace` op. Voorrang: `rij` > `regel` > `strategie`.

| Oud | Nieuw | Waar opgelost |
|---|---|---|
| `/toekomst/instellingen?regel=eindstrategie` | `?rij=stopmoment` | alias (client) |
| `?regel=onttrekkingsstrategie` | `?rij=onttrekking` | alias |
| `?regel=onttrekkingsvolgorde` · `verdeling-toename` · `onttrekking-afname` | `?rij=` dezelfde naam | alias |
| `?strategie=aow` · `pensioen` · `werk` · `huis` | `?rij=aow` · `pensioen` · `werk` · `huis` | alias; `pensioen` via deeplink opent de factor-A-uitvraag (S6) |
| `/toekomst?strategie=open` · `/toekomst?modal=strategie` · `/horizon/strategie` | `/toekomst/instellingen?rij=stopmoment` | `next.config.ts` (bestemming bijgewerkt) |
| `/toekomst?modal=withdrawal` | `/toekomst/instellingen?rij=onttrekking` | `next.config.ts` |
| `/toekomst/strategie?focus=<key>` · zonder focus | `/toekomst/instellingen?rij=<key>` · `?rij=aow` | `next.config.ts` |
| `/toekomst?tab=gebeurtenissen&strategie=<key>` | `/toekomst/instellingen` (query reist mee, alias opent de rij) | `next.config.ts` ongewijzigd |
| `/toekomst?uitgaven=open` · `/horizon/uitgaven-na-pensioen` · `/toekomst/uitgaven-na-pensioen` | `/toekomst/instellingen?rij=uitgave-na-pensioen` | `next.config.ts` (nieuwe `has`-regel; mount-effect laat `uitgaven` los) |
| `/toekomst/instellingen#voorkeuren` | blijft werken: het anker `voorkeuren` blijft op de wrapper van sectie I | `AnkerScroll` |
| `/toekomst/instellingen?planreview=open` | ongewijzigd | `PlanReviewProvider` |
| Nieuw: `?rij=eindleeftijd` · `geen-tekort-lening` · `inflatie` · `rendement` · `box3` | — | rij-register |

Producenten die naar `?rij=` gaan (stap 9): `katern-meldingen.ts` (stopmoment, geen-tekort-lening,
eindleeftijd, aow, huis), `aow-notice-minimize.ts`, `eindsituatie-copy.ts`, `strategie-route.ts#strategieHref`,
`plan-review/overzicht.ts` (aanpassen-hrefs), `jaarruimte-card.tsx`, `belasting/box1/page.tsx`,
`totaalplan-blocks.tsx`, `welcome-guide.ts`, `fire-retirement-expense-panel.tsx`, `event-pane-view.tsx`,
`gebeurtenissen-view.tsx` (via `strategieHref`, dus zonder eigen diff), `doelen-lab.tsx`, `plan-kpi-strip.tsx`.

## 3. Dekkingstabel StrategieModal → rij + body

De modal verdwijnt pas in stap 11, nadat elke regel hieronder in een test bereikbaar is bewezen.

| Tab / functie in de modal | Wordt | Body (bestaand) | Bewijs |
|---|---|---|---|
| Kop-badges Stop · Eind · Onttrekking · Eigen woning | Rijwaarden in I en II | — (`instellingen-rijwaarden.ts`) | rijwaarden-test pint elke waarde tegen de bron |
| **Eind**: vraag 1 stop-anker (4 kaarten, AOW uit de gebruikerstabel, stopleeftijd) | rij Stopmoment | `EindstrategieBody` → `StopPlanVragen` | render-test: ✎ Stopmoment toont "Wanneer wil je stoppen met werken?" |
| **Eind**: vraag 2 eindleeftijd + wat blijft over + nalatenschap | rij "Tot welke leeftijd, en wat blijft over" | idem, pane scrollt naar `#stop-plan-eindleeftijd` | render-test + anker-test |
| **Eind**: autosave per geldige wijziging + grafiek ververst terwijl open (B-057/B1) | Opslaan in de pane-footer; `onSaved` → `router.refresh()` | `RegelBewerkenPane` | Bewuste gedragswijziging: expliciet opslaan zoals elke andere rij. Het canvas ververst na opslaan (§4.3). |
| **Eind**: link "Dezelfde vragen staan bij Instellingen" | vervalt (je bent er) | — | — |
| **Onttrekking**: vier profielkaarten met uitkomst per profiel ("FIRE: N jr" / `ankerKort`) | "Vergelijk de vier profielen" (ingeklapt) in de onttrekkingsbody | `OnttrekkingsstrategieBody` + nieuw `OnttrekkingProfielVergelijk` | test pint de regel per profiel tegen `runRegelProjection(snapshot, { withdrawalProfileConfig })` |
| **Onttrekking**: vergelijkingsgrafiek (4 lijnen, event-markers, guardrail-corridor) | idem | `ComparisonChart` + `GuardrailsBandwidthChart`, verplaatst uit de modal | render-test |
| **Onttrekking**: bestedingsruimte min–max per maand | idem | verplaatst ongewijzigd | render-test |
| **Onttrekking**: samenvatting (stopmoment · reikt tot · vermogen op stopmoment / FIRE-leeftijd · doelbedrag · opnamepercentage · eindvermogen) | idem | uit `RegelProjection.samenvatting` (stap 2) | test pint tegen `toSimResult` van dezelfde run |
| **Onttrekking**: "Profielen uitgelegd" + "Actief"-badge | de optiekaarten van de body (`RegelOptionCard`, beschrijving, geselecteerd = opgeslagen profiel) | `OnttrekkingsstrategieBody` | bestaand `onttrekkingsstrategie-body.test.tsx` |
| **Onttrekking**: kiezen en bewaren van profiel, 3-fasen-curve, guardrails, flex-spending | rij Onttrekking (was al alleen in Voorkeuren) | `OnttrekkingsstrategieBody` | bestaand |
| **Onttrekking**: lijst "Levensgebeurtenissen op de tijdlijn" | de gebeurtenissenlijst op Plan (`#gebeurtenissen`) + de event-markers in de vergelijkingsgrafiek | — | NP-werk; markers in render-test |
| **Onttrekking**: "Doorrekening niet beschikbaar" (geen context/basisgegevens) | de vergelijking toont dezelfde degradatiezin zonder snapshot of zonder rijen | `OnttrekkingProfielVergelijk` | test |
| **Onttrekking**: disclaimer "Dit is een simulatie — geen financieel advies" | onder de vergelijking | idem | render-test |
| **Woning**: `HousingStrategySection` (zonder preview) | rij Eigen woning, mét preview én verschilregel | `HousingStrategySection` | render-test |
| Link "Geavanceerde instellingen" | vervalt (je bent er) | — | — |
| Opener "Je plan-keuzes →" in het lab | `Link` naar `?rij=stopmoment` | — | `doelen-lab.test.ts` |
| Deeplinks `?strategie=open`, `?modal=strategie`, `/horizon/strategie` | `?rij=stopmoment` | — | `next.config.test.ts` |

`WithdrawalModal` en het legacy-gebeurtenisformulier zijn al weg (fase 1). Er blijft niets over dat alleen de
modal kon.

## 4. Stappen

Elke stap eindigt met `npx tsc --noEmit` (gefilterd op de eigen bestanden), vitest via **PowerShell** op de
geraakte paden, en een eigen commit (`git add -- <paden>` + `git commit -- <paden>`). Nooit `add -A`.

### Stap 0 — Wachten en herijken (geen commit)
- Pas na "go". `git status` en `git log -5`; herlees de door NP gewijzigde bestanden (instellingen-page,
  `instellingen-katern.tsx`, `use-toekomst-overlay-state.ts`, `deeplink-cleanup.ts`, `gebeurtenissen-view.tsx`,
  `plan-verdieping.tsx`, `plan-paneel.tsx`, `toekomst-state-provider.tsx`).
- Baseline: `npx tsc --noEmit` + vitest op `components/toekomst components/future lib/horizon lib/plan-review
  lib/future next.config.test.ts`. Noteer rode tests die er al waren.
- Laad de `ui-ux`-skill (`page-blueprints.md` type Instellingen/lijst, `pattern-cards.md`, `quality-checklist.md`).

### Stap 1 — Rij-register (puur)
- Nieuw `lib/toekomst/instellingen-rij.ts`: `RijSleutel` (15 sleutels, §0), `RIJ_META: Record<RijSleutel, …>`
  (sectie, editor-soort: `regel`+optioneel anker · `strategie` · `voorkeur`-kolom · `box3` · `uitgaven`),
  `REGEL_NAAR_RIJ: Record<RegelId, RijSleutel>`, `STRATEGIE_NAAR_RIJ: Record<ManagedStrategy, RijSleutel>`,
  `resolveRijDeeplink(params)` → `{ rij, via: 'rij'|'regel'|'strategie' } | null`, `instellingenRijHref(rij)`,
  `RIJ_DEEPLINK_PARAMS`.
- Test `lib/toekomst/instellingen-rij.test.ts`: elke alias uit §2, de voorrang, onbekende waarden (`open`, leeg) → `null`,
  en een compleetheidstoets op de Records.

### Stap 2 — Override en samenvatting (additief)
- `lib/future/regel-sim.ts`: `RegelSimOverride.potRules?: Record<string, unknown> | null` → `profile.pot_rules`
  (de adapter leest die kolom zelf via `resolvePotRules`). Daarnaast `RegelProjection.samenvatting?` met de velden die
  de profielvergelijking nodig heeft (`stopAnker`, `vastStopLeeftijd`, `fireAge`, `fireReachable`,
  `firePortfolioAtFire`, `requiredFirePortfolio`, `implicitWithdrawalRate`), rechtstreeks uit `toSimResult`, dus consume.
- Test in `lib/future/regel-sim.test.ts`: zonder override is de context byte-gelijk; `potRules` zet alleen `pot_rules`;
  de samenvatting is gelijk aan `toSimResult` van dezelfde run.
- `lib/architecture/calculations.ts`: de nieuwe override en de nieuwe lezers noemen bij de horizon-kernel-consumers.
- Review-vlag: raakt een rekenmotor-adapter. De `calc-engine-specialist`-lens hoort in de eindreview.

### Stap 3 — Verschilregel in elke body (één body, twee hosts)
3a. **Pot-regels**: `onttrekkingsvolgorde-body.tsx`, `verdeling-toename-body.tsx` en `onttrekking-afname-body.tsx`
  publiceren `footerInfo` (`FireDeltaFooter`, basis vs. `{ potRules: concept }`) zodra er een `simSnapshot` is en iets
  gewijzigd is. De illustratie blijft. De wizardstap Potten krijgt dezelfde regel mee (`potten-editor.test.tsx` bijwerken).
3b. **Woning**: `HousingStrategySection` krijgt een optionele `simSnapshot`. In host-modus publiceert hij `footerInfo` met
  `{ housingStrategyConfig: <PUT-vorm> }`. `WoningEditor` geeft `context.snapshot` mee, zodat de wizard dezelfde regel krijgt.
3c. **Sheets**: `ModalFooter` krijgt een optionele `info`-prop (links van de knoppen, dezelfde plek als bij de pane).
  `VoorkeurBewerkenSheet` en `Box3MethodeSheet` geven `actions.footerInfo` door. Zonder `info` blijft de render ongewijzigd.
3d. **Levensstrategieën**: `StrategieModalShell` gaat van een directe `BottomSheet` naar `ShellOverlay kind="sheet"`
  (en van de overlay-allowlist af). `StrategieFooter` krijgt `info`. `StrategieEditors` krijgt `snapshot` en geeft de drie
  editors impact `{ kind: 'kern', snapshot }` (terugval `preview` zonder snapshot). Zo toont de editor de verschilregel in de
  footer, net als in de wizard. Huis: host-modus met footer-Opslaan, `preview` en `simSnapshot`.
- Tests per deel: body met snapshot → `runRegelProjection` aangeroepen met precies de override-sleutel van de wizard
  (spy), footer toont de regel; zonder wijziging geen regel.

### Stap 4 — Profielvergelijking uit de modal
- Nieuw `components/future/regels/onttrekking-profielvergelijk.tsx` (+ `ComparisonChart`, `GuardrailsBandwidthChart`,
  `PROFIEL_INFO`-kleuren als categorie-herkenning, ongewijzigd verplaatst).
- Vier runs: `runRegelProjection(snapshot, { withdrawalProfileConfig: { ...opgeslagen, profiel } })`, **pas bij openklappen**
  (lazy, geen vier extra kernel-runs per pane-opening).
- Gerenderd in `OnttrekkingsstrategieBody` als disclosure "Vergelijk de vier profielen", in beide weergavemodi.
- Equivalentietest (eenmalig, vóór stap 11): voor een fixture is het resultaat van de override-run gelijk aan de
  injectie van de modal (`withdrawal_profile_config: { ...rawCfg, profiel }` op dezelfde rauwe context).
- Bekende schuld, ongewijzigd meeverhuisd: de guardrail-corridor (`withdrawal × floor/ceiling`) en de bestedingsruimte
  (min/max ÷ 12) zijn weergave-afleidingen in de UI. Die worden als aandachtspunt benoemd, niet in deze fase herbouwd.

### Stap 5 — Uitgaven-body als één body
- `components/future/plan-review/uitgaven-editor.tsx`: `UitgavenEditorInhoud` + context-laden wordt de export
  `UitgavenBody({ snapshot, onActionsChange, onSaved })`. `UitgavenEditor` (wizard) wikkelt hem.
- Nieuw `components/toekomst/instellingen/uitgaven-rij-pane.tsx`: `ShellOverlay kind="pane"`-host met footer-Opslaan en `footerInfo`.
- Pariteitscheck met `uitgaven-client.tsx` (methodekeuze, eigen bedrag, vragenlijst, foutpad) in de test. Mist er iets,
  dan komt het in de body, niet in de host.

### Stap 6 — Anker in de regel-pane
- `RegelBewerkenPane` krijgt `anker?: string` en scrolt na openen naar dat id in de pane.
- `StopPlanVragen`: `id="stop-plan-stopmoment"` en `id="stop-plan-eindleeftijd"` op de twee `<section>`s. Die zijn
  zichtbaar; de sr-only-spans zijn geen scrolldoel. `#geen-tekort-lening` bestaat al.
- Test: open met anker → `scrollIntoView` op het juiste element.

### Stap 7 — Rij-primitive en rijwaarden
- Nieuw `components/toekomst/instellingen/instelling-rij.tsx`: label · stippellijn · waarde · ✎, de hele rij één
  `<button>` (≥ 44 px, `aria-label` "<label> aanpassen"), of zonder ✎ als leesrij (Effectief SWR). Tokens:
  `--border-ed`, `--ink-*`, `--module-active-*`.
- Nieuw `lib/toekomst/instellingen-rijwaarden.ts` (puur): waarde per rij uit props. Stopmoment uit `firePlan.anchor` en
  `STOP_ANCHOR_OPTIONS`, nooit de opgeloste leeftijd. Eindleeftijd uit `endForm`/`endAge`/`legacyAmount`; het
  nalatenschapsbedrag als `MaskedAmount` mét vrijheidstijd via de bestaande helper en het canonieke dagtarief uit de
  bundel. Onttrekking uit `resolveWithdrawalProfiel`. Uitgave na pensioen uit dezelfde bron als KPI 4, want één getal.
  Geen tekort-lening uit `fire_no_deficit_loan !== false`. Pot-regels uit de bestaande `formatGroupOrder`/`surplusLabel`
  (verhuizen uit `voorkeuren-view.tsx`). AOW, pensioen en werk uit de beheerde events. Huis uit
  `HOUSING_STRATEGY_LABELS`. Markt uit `fireParams`.
- Kopij (sectiekoppen, rijlabels, "Wat doet inflatie met je plan?") in `lib/horizon/katern-copy.ts`, één bron.
  **Gaat langs merkstem en compliance** (kopij-toets §10 "nog te toetsen: de instellingenrijen").
- Test `instellingen-rijwaarden.test.ts`: elke waarde gepind tegen de canonieke bron voor dezelfde fixture. De
  Stopmoment-waarde bevat nooit `fireAgeFractional`.

### Stap 8 — Het katern op rijen
- Nieuw `components/toekomst/instellingen/instellingen-rijen.tsx` (client): drie `RomanSection`s, de rijen, één
  `open: RijSleutel | null`, en de hosts `RegelBewerkenPane` (met `anker`), `VoorkeurBewerkenSheet` en
  `Box3MethodeSheet` (nu mét `snapshot`), `StrategieEditors` (met `snapshot`) en `UitgavenRijPane`. Alles blijft gemount
  met `open` (focusherstel).
- Nieuw `components/toekomst/instellingen/use-instellingen-rij-deeplink.ts`: leest `rij`/`regel`/`strategie` via
  `resolveRijDeeplink`, opent, en ruimt alle drie in één `router.replace` op. Staat `planreview` er ook, dan wacht hij
  (patroon `oude-tab-param.tsx`). S6: via de deeplink op `pensioen` → `autoOpenJaarruimte`.
- `instellingen-katern.tsx`: `VoorkeurenView` → `InstellingenRijen`; anker `voorkeuren` blijft op sectie I.
- `instellingen/page.tsx`: extra props (`housingStrategy`, `fire_no_deficit_loan`, het dagtarief, de uitgave-grondslag
  van KPI 4). Alles uit de bestaande ladingen, geen nieuwe query.
- Weg: `components/future/voorkeuren-view.tsx`, `levensstrategieen-section.tsx`, `voorkeuren-view.test.tsx`. De cases
  verhuizen naar `instellingen-rijen.test.tsx`: S6, deeplinks, beide modi met alle vier strategieën, DepthSection-leesregels.
- `AfbouwOverzichtCard` gaat niet mee naar de rijen, zie stap 12.
- Test `instellingen-rijen.test.tsx`: elke ✎ opent de juiste body; `?rij=`/`?regel=`/`?strategie=` openen hetzelfde;
  één overlay tegelijk; Eenvoudig (DepthSections, alle vier strategieën); de inflatielink naar `/toekomst/inflatie-koopkracht`;
  geen `<h1>`.

### Stap 9 — Alle producenten naar `?rij=`
- `strategieHref` en `instellingenRegelHref` leveren `instellingenRijHref(...)`. Letterlijke hrefs in de lijst van §2 omzetten.
- `katern-meldingen.ts`: tekort-lening → `geen-tekort-lening`; stopmoment → `stopmoment`; eindsituatie →
  `eindleeftijd` (`EINDSITUATIE_INSTELLING_HREF`); AOW → `aow` (`AOW_ONTBREEKT_COPY.actieHref`); huis → `huis`.
  Commentaar r. 234 bijwerken.
- `next.config.ts`: bestemmingen uit §2, plus de nieuwe `has`-regel `uitgaven=open` en de twee uitgaven-routes.
- `oude-tab-param.tsx`: `rij` bij `ANDERE_OPRUIMERS`.
- `lib/briefing/validate-hrefs.ts` nalopen of er query-sleutels gevalideerd worden.
- Tests: `katern-meldingen.test.ts`, `aow-notice-minimize.test.ts`, `strategie-route.test.ts`, `next.config.test.ts`,
  `toekomst-deeplinks.contract.test.ts` (uitgaven → redirect), `jaarruimte-card.test.tsx`, `totaalplan-blocks.test.tsx`,
  `welcome-guide.test.ts`, `katern-melding.test.tsx`, `toekomst-katern-meldingen.test.tsx`, `plan-review-pane.test.tsx`,
  `fin-home.test.tsx`, regressiesuite `lib/regression-tests/suites/horizon-strategie-pagina.ts` (Location).

### Stap 10 — KPI 4 linkt naar de rij
- `plan-kpi-strip.tsx`: in de persoonlijke weergave `href: instellingenRijHref('uitgave-na-pensioen')`. In de
  huishoudweergave blijft `openRetirementExpensePane` → `HouseholdRetirementPane`: de gezamenlijke uitgave is geen
  persoonlijke instelling en hoort niet in Instellingen.
- `use-toekomst-overlay-state.ts`: `uitgavenPaneOpen` en de `?uitgaven=`-tak eruit (de redirect vangt de link).
  `openRetirementExpensePane` zet alleen nog huishouden. `deeplink-cleanup.ts`: `uitgaven` uit `CONSUMED_DEEPLINK_PARAMS`.
- `toekomst-overlays.tsx`: `UitgavenPane`-mount weg. `uitgaven-pane.tsx` en `uitgaven-client.tsx` weg, als een grep
  geen andere consument vindt.
- Tests: `plan-kpi-strip`-test (href vs. onClick per perspectief), `horizon-client.na-pensioen-klik.test.ts`
  bijwerken of verhuizen, `toekomst-overlays.test.ts`, `deeplink-cleanup.test.ts`.

### Stap 11 — StrategieModal weg (pas na het bewijs)
- Eerst `components/toekomst/instellingen/strategie-modal-dekking.test.tsx`: één `it` per rij van §3 die de functie
  in `InstellingenRijen` bereikt (render + klik + assertie). Groen = de modal mag weg.
- Dan weg: `components/app/horizon/strategie-modal.tsx`, `strategie-modal.autosave.test.ts`,
  `strategie-modal.hooks-volgorde.test.ts`; dynamic import en mount in `toekomst-overlays.tsx`; `'strategie'` uit
  `ActiveModal`; `StrategieInitialTab` en de state in `types.ts`, `use-toekomst-overlay-state.ts` en
  `toekomst-overlay-host.tsx`; `doelen-lab.tsx` "Je plan-keuzes →" wordt een `Link` naar `?rij=stopmoment`
  (+ `doelen-lab.test.ts`); het commentaar in `use-toekomst-scenario.ts`; de `ALLOWLIST`-regel in
  `scripts/check-client-data-reads.mjs`; de next.config-commentaren.
- `shouldAutosavePlanDraft` en `strategie-impact`'s `preview`-tak: weg als ze wees zijn (grep); anders laten staan.

### Stap 12 — Afbouw-overzicht naar Plan (§5 inventaris)
- `AfbouwOverzichtCard` naar de verdieping van Plan (`plan-verdieping.tsx`), `HideInSimple`, met de sim-rijen en de
  vrijheidsleeftijd uit de state-provider: dezelfde run als het canvas, geen `dashboardData.simRows` meer.
- Test: eindsaldo's gepind tegen de provider-rijen voor dezelfde fixture. Let op: het getal kan verschuiven t.o.v. de
  oude kaart, die uit een andere lading kwam. Dat is de bedoeling (één bron), en staat in het rapport.

### Stap 13 — Documentatie en UAT
- `lib/architecture/hld-model.ts`: capability "elke instelling op één plek, met het effect erbij".
- `lib/architecture/calculations.ts` (als niet al in stap 2).
- ADR 0179: korte stand-regel "fase 3 uitgevoerd" onder Platen en views (0142 D5 en 0129 B13 zijn al geamendeerd).
- `lib/page-info-content.ts` (sleutel `/toekomst/instellingen`) en de ⌘K-sublabel (`navigation-index.ts`) als die
  nog "gebeurtenissen" of "strategieën" noemen.
- UAT via `uat-docs-keeper` (niet door mij): TOEK-18..21 (verschilregel in de footer i.p.v. inline), 24, 25, 26
  (rij i.p.v. kaart "Effectief SWR"), 42 (rijen, `?rij=`), 44, 47, 48, 51 (`?rij=geen-tekort-lening`), en
  `nav-checks.ts` (`modalStrategie`).

### Stap 14 — Eindverificatie
- `npx tsc --noEmit`; vitest (PowerShell) op `components/toekomst components/future components/app/horizon lib/toekomst
  lib/future lib/horizon lib/plan-review next.config.test.ts`.
- Gates: `npm run check:headings`, `check:client-reads` (ALLOWLIST krimpt), `check:overlays` (allowlist krimpt),
  `check:tap-targets`, `merkstem:scan`, `npm run uat:stale --base=origin/master`.
- Visuele checklist (desktop 1280, mobiel 390 en 360): (1) Instellingen Volledig vs. Eenvoudig; (2) elke ✎ opent zijn
  body, pane naast het canvas op desktop, sheet of stack op mobiel, sticky footer met verschilregel boven de nav-pill;
  (3) Stopmoment-rij zonder leeftijdsgetal terwijl de kop "Vrij mogelijk vanaf je 52e." zegt; (4) Eindleeftijd-rij landt
  op vraag 2; (5) Geen tekort-lening landt op de schakelaar; (6) de profielvergelijking open en dicht, guardrails
  geselecteerd; (7) de melding "Geen AOW op je tijdas" en KPI 4 landen op hun rij; (8) de oude deeplinks uit §2; (9) na
  opslaan beweegt het compacte canvas mee (desktop).

## 5. Tests (samengevat)

Nieuw: `lib/toekomst/instellingen-rij.test.ts`, `lib/toekomst/instellingen-rijwaarden.test.ts`,
`components/toekomst/instellingen/instellingen-rijen.test.tsx`, `…/use-instellingen-rij-deeplink.test.tsx`,
`…/uitgaven-rij-pane.test.tsx`, `…/strategie-modal-dekking.test.tsx`,
`components/future/regels/onttrekking-profielvergelijk.test.tsx`, de pot-regel-body-tests (verschilregel).
Bijgewerkt: zie per stap. Rendert een test een `ShellOverlay` onder `vi.useFakeTimers()`, dan geen `waitFor` maar de
microtask-flush binnen `act()` (precedent `vragenlijst-uitnodiging.test.tsx`).

Kerngetal-pinnen (non-negotiable): de rijwaarden (stap 7), de uitgave-rij = KPI 4, de profielvergelijking = de engine,
en de afbouwkaart = de provider-rijen (stap 12).

## 6. Risico's

- **Gedeelde werkboom.** NP heeft de instellingen-page, het katern, de overlay-state, `deeplink-cleanup.ts`,
  `gebeurtenissen-view.tsx`, `plan-verdieping.tsx` en `plan-paneel.tsx` ongecommit open. Stap 8, 10 en 12 raken die.
  Pas na hun commit; per pad stagen.
- **Eén body, twee hosts werkt twee kanten op.** Stap 3 en 4 veranderen ook de wizard (verschilregel bij potten en
  woning, profielvergelijking bij Potten). Dat is gewenst, maar de wizardtests en TOEK-44 bewegen mee.
- **Gedragswijzigingen** (bewust, in het rapport): het plan wordt niet meer per wijziging opgeslagen (B-057) maar met
  Opslaan. Strategie-editors tonen het effect in de footer in plaats van de inline regel "nu → concept". De uitgaven-rij
  bewaart met Opslaan in plaats van bij de methode-klik. Het Opslaan van Huis zit in de footer.
- **Prestaties.** Rijwaarden draaien geen kernel. De profielvergelijking rekent pas bij openklappen. De verschilregel
  pas na een wijziging (patroon `VoorkeurBewerkenBody`).
- **Twee opruimers op dezelfde URL** (`planreview` + `rij`): de deeplink-hook wacht, zoals `oude-tab-param.tsx`.
- **Aliassen nooit weghalen.** Mails en notificaties met `?regel=`/`?strategie=` bestaan al. Het contract staat in
  `instellingen-rij.test.ts`.
- **Weergave-afleidingen in de vergelijking** (corridor, bestedingsruimte) verhuizen zonder herbouw. Dat is schuld, geen nieuw werk.
- **Kopij** van de rijen is nog niet getoetst. Tot de merkstem/compliance-ronde staat ze als concept in `katern-copy.ts`.

## 7. Open punten

- Geen open eigenaarsbesluiten: §11 dekt alles. Drie bouwkeuzes die volgen uit bestaande normen en in het rapport komen:
  (a) Marktaannames, Geen tekort-lening en pot-regels staan in Eenvoudig achter een `DepthSection` en niet achter
  `HideInSimple` (ADR 0026, dode deeplinks); (b) KPI 4 in de huishoudweergave blijft de huishoud-pane op Plan openen;
  (c) de afbouwkaart rekent voortaan uit de Plan-run, dus zijn getallen kunnen verschuiven.
- Kopijronde (merkstem + compliance) voor de rijlabels, sectiekoppen, rijwaarde-zinnen en de inflatielink, vóór de release.

## 8. Bestanden (eigendomsafbakening)

**Nieuw**
- `lib/toekomst/instellingen-rij.ts` · `lib/toekomst/instellingen-rij.test.ts`
- `lib/toekomst/instellingen-rijwaarden.ts` · `lib/toekomst/instellingen-rijwaarden.test.ts`
- `components/toekomst/instellingen/instelling-rij.tsx`
- `components/toekomst/instellingen/instellingen-rijen.tsx` · `instellingen-rijen.test.tsx`
- `components/toekomst/instellingen/use-instellingen-rij-deeplink.ts` · `use-instellingen-rij-deeplink.test.tsx`
- `components/toekomst/instellingen/uitgaven-rij-pane.tsx` · `uitgaven-rij-pane.test.tsx`
- `components/toekomst/instellingen/strategie-modal-dekking.test.tsx`
- `components/future/regels/onttrekking-profielvergelijk.tsx` · `onttrekking-profielvergelijk.test.tsx`

**Gewijzigd**
- `app/(app)/toekomst/(katern)/instellingen/page.tsx` *(NP)*
- `components/toekomst/instellingen/instellingen-katern.tsx` · `instellingen-katern.test.tsx` *(NP)*
- `lib/future/regel-sim.ts` · `lib/future/regel-sim.test.ts`
- `components/future/regels/onttrekkingsvolgorde-body.tsx` · `verdeling-toename-body.tsx` · `onttrekking-afname-body.tsx`
  · `onttrekkingsstrategie-body.tsx` (+ tests) · `components/future/regels/shared.tsx` (alleen als een gedeelde helper nodig is)
- `components/future/regel-bewerken-pane.tsx` · `components/horizon/stop-plan-vragen.tsx`
- `components/future/strategie/housing-strategy-section.tsx` (+ test) · `strategie-editors.tsx` · `strategie-modal-shell.tsx`
  · `aow-strategie-editor.tsx` · `werk-strategie-editor.tsx` · `pensioen-strategie-editor.tsx` (+ test) · `strategie-impact.tsx`
- `components/future/voorkeur-bewerken-sheet.tsx` (+ test) · `components/future/box3-methode-sheet.tsx` (+ test)
  · `components/app/modal-footer.tsx`
- `components/future/plan-review/uitgaven-editor.tsx` · `woning-editor.tsx` · `potten-editor.tsx` (+ tests)
- `lib/horizon/katern-copy.ts` · `lib/horizon/katern-meldingen.ts` (+ test) · `lib/horizon/aow-notice-minimize.ts` (+ test)
  · `lib/horizon/eindsituatie-copy.ts` · `lib/horizon/strategie-route.ts` (+ test) · `lib/plan-review/overzicht.ts`
- `next.config.ts` · `next.config.test.ts` · `lib/horizon/toekomst-deeplinks.contract.test.ts`
- `components/toekomst/layout/oude-tab-param.tsx` (+ test)
- `components/toekomst/plan/plan-kpi-strip.tsx` (+ test) · `components/toekomst/plan/plan-verdieping.tsx` *(NP)*
- `components/toekomst/state/use-toekomst-overlay-state.ts` *(NP)* · `components/toekomst/state/types.ts`
  · `components/toekomst/state/use-toekomst-scenario.ts` (commentaar)
- `components/toekomst/overlays/toekomst-overlays.tsx` · `toekomst-overlay-host.tsx` · `toekomst-overlays.test.ts`
- `lib/horizon/deeplink-cleanup.ts` · `deeplink-cleanup.test.ts` *(NP)*
- `components/toekomst/doelen/doelen-lab.tsx` · `doelen-lab.test.ts` *(fase-4-gebied)*
- `components/overview/jaarruimte-card.tsx` (+ test) · `app/(app)/overzicht/belasting/box1/page.tsx`
  · `components/rapportage/totaalplan-blocks.tsx` (+ test) · `lib/welcome-guide.ts` (+ test)
  · `components/horizon/fire-retirement-expense-panel.tsx` · `components/app/horizon/event-pane-view.tsx`
  · `components/app/fin/fin-home.test.tsx` · `components/toekomst/meldingen/katern-melding.test.tsx`
  · `components/toekomst/meldingen/toekomst-katern-meldingen.test.tsx` · `components/future/plan-review/plan-review-pane.test.tsx`
  · `components/app/horizon/horizon-client.na-pensioen-klik.test.ts`
- `lib/regression-tests/suites/horizon-strategie-pagina.ts` · `lib/briefing/validate-hrefs.ts` (alleen als nodig)
- `scripts/check-client-data-reads.mjs` · `scripts/check-overlay-standard.mjs` (allowlists krimpen)
- `lib/architecture/calculations.ts` · `lib/architecture/hld-model.ts` · `docs/adr/0179-toekomst-in-drie-katernen.md`
- `lib/page-info-content.ts` · `lib/command-palette/navigation-index.ts` (alleen als de tekst achterloopt)

**Verwijderd**
- `components/app/horizon/strategie-modal.tsx` · `strategie-modal.autosave.test.ts` · `strategie-modal.hooks-volgorde.test.ts`
- `components/future/voorkeuren-view.tsx` · `voorkeuren-view.test.tsx` · `components/future/levensstrategieen-section.tsx`
- `components/app/horizon/uitgaven-pane.tsx` · `app/(app)/horizon/uitgaven-na-pensioen/uitgaven-client.tsx` (na grep)

**Niet van mij** (UAT via `uat-docs-keeper`): `lib/uat/acceptance/toek.ts`, `lib/uat/acceptance/nav-checks.ts`, `lib/uat/flows/toek.ts`.
