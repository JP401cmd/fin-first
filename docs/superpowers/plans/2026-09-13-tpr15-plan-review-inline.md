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

- [ ] A — client-veilige snapshot + toepassing in dashboard-data-loader
- [ ] A — `GET /api/plan-review/editor-context` + test
- [ ] A — bewerkstand + editor-register in PlanReviewPane + test
- [ ] A — effectmaat drie treden in overzicht.ts + test
- [ ] A — security-specialist
- [ ] 1 — EindstrategieBody inline
- [ ] 2 — extracties (pure move) + UitgavenMethodeBody inline
- [ ] 5, 4, 3, L2 — zie tabel
- [ ] Slot
