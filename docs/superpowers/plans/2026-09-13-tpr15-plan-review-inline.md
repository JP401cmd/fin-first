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
- [ ] 3 — eerst `life_events`-schrijfroute (+ security), dan AOW (aanmaken bij opslaan) / pensioen / werk inline; `raw.events` op eigen user_id
- [ ] L2 — inflatie, terugvalrendement, Box 3, rendement per bezitting inline; RegelSimOverride uitbreiden; `/api/parameters`-retry
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
