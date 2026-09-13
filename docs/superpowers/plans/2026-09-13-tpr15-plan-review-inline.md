# TPR-15 — Plan-review fase 2: elke instelling inline in de wizard

Kaart: https://app.notion.com/p/3daf9e8d568a81689484fbf1ebd71c57 · ADR 0142 · route `extend-feature` (+ `refactor` voor extracties).
Besluiten eigenaar 13 sep 2026 staan in de kaart-body; samengevat: opslaan = bevestigen · AOW pas bij opslaan · verkoopinstelling voor alle eigen niet-liquide bezittingen · effectmaat in drie treden · laag 2 inline met één waarde · per fase groen + commit.

## Bijstelling van de fasering (13 sep, na lezen van de code)

De kaart zette "alle body-extracties" als losse eerste fase. Twee bodies bestaan al (`EindstrategieBody`, `UitgavenNaPensioenClient` met `inPane`/`onActionsChange`), en de juiste API van een body volgt pas uit de host. Daarom: **extractie direct vóór de fase die hem nodig heeft**, in dezelfde fase, als aparte pure-move-commit.

## Host-contract (fase A — gedeelde infrastructuur)

- **Body-contract** = het bestaande `RegelEditActionsState` (`components/future/regels/types.ts`): body publiceert `{ canSave, saving, save, footerInfo }` via `onActionsChange`, roept `onSaved` na een geslaagde write. Geen tweede contract.
- **Bewerkstand in `PlanReviewPane`**: per stap een knop "Aanpassen" die de editor-body ín de stap uitklapt (geen navigatie, geen geneste overlay). In bewerkstand: primary = "Opslaan en bevestigen" (disabled tot `canSave`), secondary = "Annuleren" (terug naar het overzicht, niets geschreven), `footerInfo` = die van de body. `onSaved` → `PUT /api/plan-review` (markering) → voortgang → cache leeg → `onChanged()` → volgende stap. Zonder wijziging blijft de bestaande "Bevestigen".
- **Editor-register** `PLAN_REVIEW_EDITORS: Record<PlanReviewStap, …>` — een stap zonder editor is een expliciete `null` met reden (meebeweeg-check laag a/b).
- **Editor-context lui ophalen**: `GET /api/plan-review/editor-context` levert wat de bodies nodig hebben (`RegelSimSnapshot`, `firePlan`, …) — alleen bij het openen van een bewerkstand, één keer per pane-open, ongeldig na een save. /toekomst laadt de snapshot bewust niet (zware data zit op de subpagina's).
- **Client-veilige snapshot** `buildClientRegelSimSnapshot(shared)` (één home): `rawContextZonderPartner` + `*_encrypted`/`*_hash` uit assets/debts gestript (de kernel leest die niet — grep 0 treffers in `lib/horizon-kernel`). Ook toegepast in `dashboard-data-loader` → dicht het latente lek op /toekomst/voorkeuren (RSC-prop met `select('*')`-assetrijen). `security-specialist` (schone context) op deze fase.

## Fasen

| Fase | Inhoud | Extractie | Gate |
|---|---|---|---|
| A | Host-contract, editor-register, editor-context-route, client-veilige snapshot, effectmaat in drie treden (`overzicht.ts`) | — | security-specialist (nieuwe route met datatoegang) |
| 1+2 | Stap 1 inline = `EindstrategieBody` · Stap 2 inline = `UitgavenMethodeBody` met conceptstand (methode-klik schrijft in de wizard niet direct) + live effect via `runRegelProjection({ retirementExpense })` | `useUitgavenContext` uit `UitgavenPane`; `UitgavenMethodeBody` uit `UitgavenNaPensioenClient` (prop `opslaanBijKiezen` default `true` = huidig gedrag) | vitest pane + bodies, tsc, check:headings/overlays/tap-targets |
| 5 | Onttrekkingsprofiel (`OnttrekkingsstrategieBody`) + pot-regels (verdeling/volgorde/afname) | per body volgens Explore-kaart | idem |
| 4 | Woonstrategie (`HousingStrategySection`, is al een sectie) + verkoopinstelling per eigen niet-liquide bezitting | sale_config-editor uit `assets-client.tsx` | security-specialist (asset-schrijfroute, huishoud-gedeelde SELECT) |
| 3 | AOW (aanmaken pas bij opslaan) + pensioen + werk + vergelijking; `raw.events` op eigen `user_id` | editors uit `StrategieModalShell`; client-direct `life_events`-writes → API (ADR 0058) waar nodig | security-specialist |
| L2 | Inflatie, terugvalrendement, Box 3, rendement per bezitting — inline, één waarde + live effect; `/api/parameters`-retry alleen bij ontbrekende kolom | `VoorkeurBewerkenBody`, `Box3MethodeBody` | — |
| Slot | Meebeweeg-check laag c (veld-register per schrijfroute + bron-scan-test), ADR 0142-aanvulling, CLAUDE.md-regel, register.ts `partner`-toelichting, UAT WF-TOEK-44 + nieuwe criteria, `will`-tests `toBe(30)` afleiden, `uat-plan.md:6432`, arch:diagram | — | gebundelde fork-review, release |

## Blokkades uit de editor-kaart (Explore, 13 sep)

- **Stap 3:** AOW-, pensioen- en werk-editor schrijven **client-direct** naar `life_events` (insert/update/delete); er is géén API-route. Eerst `life_events`-schrijfroute (zod, eigen `user_id`, upsert per `event_type` voor aow/werk, per id voor pension) → security-specialist. Pensioen: factor A schrijft client-direct naar `profiles`; `apply-parse-result` insert client-side; `PensioenProjectieChart` opent een eigen `BottomSheet` (geneste overlay) → in de wizard de detailtabel inline of weglaten. Preview draait op `previewFireAge` (PreviewBaseline van de gebeurtenissen-pagina) i.p.v. `runRegelProjection` → in de wizard vervangen door de regel-sim-override op `lifeEvents`.
- **Stap 4:** `sale_config` bewerken van een bestaande bezitting gaat client-direct `assets.update(row)` in een ~1800-regelig `AssetForm`; er is geen PATCH-route. Eerst smalle `PATCH /api/assets/[id]/sale-config` (zod op `SaleConfig`, `.eq('user_id', eigen id)`) → security-specialist. `HousingStrategySection` is al een body maar mist `readOnly` en een `onActionsChange`; preview heeft `HousingPreviewData` nodig.
- **Stap 5:** regel-bodies zijn herbruikbaar; elke save roept `onClose()` → de host geeft een no-op. `potRules`/`potBalances` worden alleen op /toekomst/voorkeuren gebouwd → meenemen in `editor-context`.
- **Plan-review GET** bouwt server-side een snapshot zonder `rawContextZonderPartner` — alleen server-side gebruikt (geen lek), maar het perspectief is personal; geen actie.

## Checklist

- [x] A — client-veilige snapshot (profiel-whitelist + Proxy-meting) + toepassing in dashboard-data-loader — 811de5c36
- [x] A — `GET /api/plan-review/editor-context` + test — 811de5c36 (uitgebreid in daa7c5a92)
- [x] A — effectmaat drie treden in overzicht.ts + test — bfc523777
- [x] A — security-specialist: geen blokkade; 🟡 profiel-whitelist opgelost
- [x] A/1/2 — bewerkstand + editor-register; stap 1 EindstrategieBody; stap 2 extracties + UitgavenEditor — 6486e8611 (incl. reviewfixes H1/H2/M1/M2/M3/L1)
- [x] 5 — PottenEditor (vier regel-bodies), pot-saldi pure move — 38adf255a + daa7c5a92
- [x] Visuele check 13 sep (jochen@/Tessa): stap 1, 2, 5 bewerkstand renderen; knopwissel Bevestigen ↔ Opslaan en bevestigen; trede 3 zichtbaar; niets opgeslagen
- [x] 4 — pure move verkoopvelden → `SaleConfigFields` + `sale-config-draft` — 10190ca45
- [x] 4 — `PATCH /api/assets/[id]/sale-config` (+ security-specialist: geen blokkade; 🟡 schuldenregel ≠ formulier opgelost via `lib/sale-config-debts.ts`), `WoningEditor` (woonstrategie in host-modus + verkoopinstelling per eigen bezitting, live effect via `assetSaleConfigs`), editor-context `woning`, register `potLiquidaties → woning` — cfe020303 (incl. reviewfixes M1/M3/L1/L3/L4)
- [x] Visuele check 13 sep (jochen@/Tessa): stap 4 pills (huis + 5 bezittingen), woonstrategie met live preview, auto → Niet verkopen → "Opslaan en bevestigen" + footer; AssetForm-verkoopvelden ongewijzigd; niets opgeslagen
- [x] 3 — pure move AOW/werk/pot-bodies + `lib/pension/pot-draft.ts` — 62399cf81
- [x] 3 — `PUT/DELETE /api/life-events/strategie` (+ security-specialist: geen blokkade; 🟢 fail-closed/tiebreaker/assert/foutteksten verwerkt), beide hosts schrijven via de route, `InkomstenEditor` (AOW pas bij opslaan, werk, pot per id/nieuw), override `lifeEvent`, eigen rijen via `loadEigenStrategieEvents` (voortgang, stap 3, editor-context), vergelijking stap 3, `aowGeschreven` in de pane — 310f38ce3 (incl. reviewfixes M1–M4, L6–L10)
- [x] Visuele check 13 sep (jochen@/Tessa): stap 3 vergelijking trede 3 (€1,115M / zonder AOW €823k / zonder pensioen €790k), bewerkstand AOW/Werk/pot/nieuwe pot, wijziging → "Opslaan en bevestigen"; modal op /toekomst/gebeurtenissen ongewijzigd; niets opgeslagen
- [x] L2 — pure move `VoorkeurBewerkenBody` + `Box3MethodeBody` — 6a0ea94be
- [x] L2 — afsluitscherm "Voor wie wil" als host (vier onderdelen, pill in de stappenbalk, geen markering), `PATCH /api/assets/[id]/expected-return` (+ security-specialist: geen blokkade; 🟢 teller over eigen rijen verwerkt), `RegelSimOverride.parameters`/`assetExpectedReturns`, editor-context `laag2`, `/api/parameters`-retry alleen bij ontbrekende kolom, register — c7bd25316 (incl. reviewfixes M1–M3 + L's)
- [x] Visuele check 14 sep (jochen@/Tessa): lijst met waarden (2,0% · 7,0% · Forfaitair · 16 bezittingen), inflatie- en bezitting-bewerkstand, validatie houdt Opslaan dicht, footer; niets opgeslagen
- [ ] Slot — meebeweeg-check laag c, ADR 0142-aanvulling, CLAUDE.md-regel, register.ts `partner`, UAT WF-TOEK-44, will-tests `toBe(30)`, uat-plan.md:6432, compliance-check nieuwe kopij, arch:diagram, parity-rebaseline, merkstem:scan

## Restpunten uit review/visuele check (nog open)

- Live footer in de bewerkstand (`FireDeltaFooter`) toont maanden-delta (trede 1), ook bij accounts in trede 3 — overweeg dezelfde treden in de footer.
- `overzicht.ts` draait bij trede 3 één extra basisrun per stap (`b.run({})`); kan uit de bundel zodra `SimResult` het liquide eindvermogen draagt.
- Dubbele `router.refresh()` na een uitgaven-save in de wizard (hook + `onChanged`).
- Kolom-whitelist per rijtype voor assets/debts in de client-snapshot (nu alleen suffix-vangrail); schulden dragen `creditor`/`notes`.
- Stap 5 in de wizard toont de bestaande regel-intro ("beschermen je tegen slechte beursjaren") — meenemen in de compliance-check. ("de 4%-regel" is sinds 4fcd352d8 weg.)
- Stap 4 (review M2): `MODE_META` in `housing-strategy-section.tsx` oordeelt ("Eenvoudig, maar onrealistisch", "past bij internationale standaard", tag "Internationale standaard") en verschijnt nu ook in de wizard, terwijl `overzicht.test.ts` A8 die woorden voor dezelfde stap verbiedt → compliance-check; neutraliseer in beide hosts en breid de A8-toets uit naar de sectie.
- Stap 4 (review M1, deel 1 — voorleggen aan eigenaar): opslaan van één onderdeel (bv. één bezitting) bevestigt de hele stap en gaat door, ook als er meer onderdelen zijn. Consistent met "opslaan = bevestigen" en stap 5; wél opgelost: blijft de stap open (A10), dan blijft de wizard in de stap met de reden.
- Stap 4 (review L2): wizard begrenst leeftijd ≤120 en kosten ≤20% (= route); AssetForm niet → een in het formulier opgeslagen buiten-bereik-waarde moet in de wizard eerst worden aangepast (melding zichtbaar).
- Security-bijvangst: `/toekomst/gebeurtenissen` geeft `housingPreview.kernelRawContext.profile` = volledige profielrij (`select('*')`) als client-prop; eigen rij, geen lek — door `alleenKernelProfiel`/`buildClientRegelSimSnapshot` halen.
- SWR-widget toont nog "Trinity Study 4%" (eigenaar: later behandelen).

### Restpunten stap 3 (310f38ce3)
- Footer-delta in trede 3 zegt bij Tessa "Geen verschil in vrijheidsdatum" terwijl een pensioenwijziging het eindbedrag wél verschuift — valt bij stap 3 extra op; hoort bij het bestaande footer-restpunt (drie treden in `FireDeltaFooter`).
- Geen unieke index op `life_events (user_id, event_type)` voor aow/werk: race over twee tabs kan een dubbele rij geven (kern pakt de eerste; route en lezer delen nu dezelfde tiebreaker). Fix = schemawijziging (partial unique index, live 0 duplicaten) + 23505 → herlezen.
- `vervangLifeEvent` per type haalt in de snapshot ook een gedeelde partnerrij weg; stap 3 telt alleen eigen rijen. Latent: geen schrijver zet `ownership='shared'` op `life_events`.
- UPO-import: `ingangLeeftijd` kan 0 worden (`lib/pension/mijnpensioen-json.ts:239`) en de parser is onbegrensd; zo'n pot is pas op te slaan na corrigeren. `apply-parse-result.ts` en onboarding `save-own-data` schrijven nog client-direct/zonder deze validatie.
- Buiten de wizard (bewust): UPO-upload, jaarruimte/factor A, projectiegrafiek, pot/werk verwijderen — op het pensioenscherm.
- `strategie-impact.tsx` draait de basis-run opnieuw per onderdeelwissel (perf, L11); de body-foutbanners zijn amber, de pane-meldingen `text-negative`.
- Wft/compliance-check: nieuwe kopij stap 3 (UITLEG in `inkomsten-editor.tsx`, vergelijkingslabels, beperkingstekst) meenemen in de slot-compliance-check.
- `lib/pension/apply-parse-result.ts` r.7 verwijst nog naar de oude plek van `eventFromPot`/`potFromEvent`.

### Restpunten laag 2 (c7bd25316)
- Het terugvalrendement (`profiles.expected_return`) verandert het plan van echte gebruikers nu niet: `assets.expected_return` is NOT NULL, dus de kern valt nooit terug. De wizard zegt dat eerlijk. Wordt pas betekenisvol met TPR-02 fase 2 (kolom nullable = schemawijziging); dan telt `zonderEigenRendement` al over eigen rijen.
- De Voorkeuren-sheet en de optimizer-chip tonen nu óók live validatie per veld en de nieuwe inflatie-uitleg (de oude noemde 2,5% terwijl de app met 2% rekent) — bewuste verbetering, geen identiek gedrag meer; de pure move zelf (6a0ea94be) was wel identiek.
- Footer toont bij trede 3 (Tessa) ook hier "Geen verschil in vrijheidsdatum" — het bestaande footer-restpunt.
- Pill "Voor wie wil" is `min-h-[32px]`, gelijk aan de stap-pills (allemaal onder 44px) — samen oplossen of accepteren.
- `onOngewijzigd` alleen in de wizard: de sheet op /toekomst/voorkeuren schrijft bij Enter zonder wijziging nog steeds een (mogelijk uit de jaarlaag ingevulde) waarde vast — bestaand gedrag.
- Geen deeplink `stap=` naar het afsluitscherm (bewust; bereikbaar via de pill).
- Compliance-check slotfase: VOORKEUR_UITLEG (inflatie, bruto rendement), de bezitting-uitleg in `laag2-editors.tsx`, de bruto-rendement-notitie, en de optimizer-helptekst "Conservatief: 4-5%" (`optimizer-client.tsx`).
