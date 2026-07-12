# UAT MIJN + BEHEER — hervat-document (handoff)

> **Status: gepauzeerd op 12 jul 2026.** De **build is compleet en groen**; de **live-run staat nog open** (geblokkeerd, zie §2). Dit document bevat alles om zonder herontdekken verder te gaan.

---

## 1. Wat is af (build — alle 15 UAT-zones nu compleet)

MIJN en BEHEER zijn de laatste twee zones; ze zijn gebouwd volgens het bestaande patroon (referentie: SCHULD/BELAST voor calc, START/NAV/RAPP voor UI-heavy).

**Verificatie (reproduceerbaar):**
```bash
npx tsc --noEmit                 # → 0 fouten
npx vitest run lib/uat lib/regression-tests/suites/uat-mijn lib/regression-tests/suites/uat-beheer
# → 39 testbestanden / 437 tests groen
```

**Nieuwe bestanden (ongecommit op master):**

| Zone | Acceptatie | Engine-checks | Engine-test | In-app suite | Flow | Flow-test |
|---|---|---|---|---|---|---|
| MIJN | `lib/uat/acceptance/mijn.ts` | `mijn-checks.ts` | `mijn.engine.test.ts` | `lib/regression-tests/suites/uat-mijn.ts` | `lib/uat/flows/mijn.ts` | `mijn.test.ts` |
| BEHEER | `lib/uat/acceptance/beheer.ts` | `beheer-checks.ts` (leeg) | `beheer.engine.test.ts` | `lib/regression-tests/suites/uat-beheer.ts` | `lib/uat/flows/beheer.ts` | `beheer.test.ts` |

**Gewijzigd (wiring, additief):**
- `lib/regression-tests/test-registry.ts` — 2 regels toegevoegd (uat-mijn, uat-beheer).
- `app/(app)/beheer/uat/uat-plaat-client.tsx` — 2 imports + `FLOW_BY_ZONE`-entries (MIJN, BEHEER). Hierdoor is de **drill-in (detailpagina) van MIJN en BEHEER nu klikbaar** op `/beheer/uat` — dit was de zichtbare klacht en is opgelost.

**Zone-eisen (verschillend per zone):**
- **MIJN** — 26 criteria (verwijsregels 10/17/23 → UAT-NAV-19/11/10, bewust geen eigen scenario). Kinds: **3 exact** (WF-MIJN-03 jaarruimte-per-persoon = €35.588 via `computeJaarruimte`+`resolvePensionFactorA`; WF-MIJN-08 gedeelde-budget-split via `computeSharePct`; WF-MIJN-11 add-on-prijzen €9/€4 uit `ADDON_PLANS`), 1 consistency (WF-MIJN-09), 22 ui-only. Veel huishouden/RLS.
- **BEHEER** — 33 criteria (contiguous, geen verwijsregels). Kinds: **0 exact** (admin-tooling zonder rekenkern → `BEHEER_ENGINE_CHECKS` bewust leeg), 9 consistency, 2 oracle (WF-BEHEER-26 horizon-strategie + WF-BEHEER-27 horizon-kernel — verifieerbaar via hun transparantie-UI), 22 ui-only. Flow = tool-catalogus (4 admin-secties als lanes), 0 cross-knopen (overlay, niet in ArchiMate).

**Procesnotitie:** beide build-subagents crashten halverwege op de **account-brede maandelijkse spendlimiet**; het restant (2 type-fixes + 6 ontbrekende bestanden + wiring) is in de hoofdthread afgemaakt. De 2 type-fixes: `resolvePensionFactorA({ pension_factor_a: null })` (PersonaProfile modelleert factor A niet) en `wfToken(wf: string | null)` (scenario.wf is nullable).

---

## 2. Wat nog open staat (live-run) + waarom geblokkeerd

**Doel (opdracht):** "alles initieel testen met chromedev en alle acceptatiecriteria" — dus een **volledige live-run** via Chrome DevTools MCP van **alle 59 scenario's** (26 MIJN + 33 BEHEER), met echte PASS/FAIL/BLOCKED-statuses op nieuwe UAT-ronde(s).

**Twee blokkades (vragen gebruikersactie):**
1. **Chrome-devtools-browser zit vast** ("already running / profile in use"). Oorzaak: er staat nog een Chrome-venster open op het chrome-devtools-profiel (`C:\Users\janpa\.cache\chrome-devtools-mcp\chrome-profile`). → **Sluit dat Chrome-venster**, dan kan de MCP opnieuw verbinden.
2. **Maandelijkse spendlimiet bereikt** → subagents zijn dood. → **Verhoog op claude.ai/settings/usage** (main-thread werkt nog wel, maar verbruikt ook).

**Breder:** ook de eerder gebouwde zones START/CASH/BUDGET/OVZ/WILL/NAV/REKEN/RAPP hebben nog **geen geregistreerde live-ronde** (tonen grijs in "Laatst bekend"). Alleen BEZIT/SCHULD/TOEK/BELAST/KRUIS + de BELAST-ronde hebben live-resultaten. Optioneel die er in één moeite bij pakken.

---

## 3. Hoe de live-run te doen (draaiboek)

**Testomgeving:**
- Dev-server op `http://localhost:3000` (start met `npm run dev` als 'ie niet draait).
- **Testaccount: `jochen@test.trifinity.nl`** — superadmin-**wegwerp**testaccount, momenteel geseed als persona **Tessa/compleet** (gezin). NIET het echte account (jpsmit@…). Veilig te seeden/aftikken.
- **Persona (her)seeden** (WIST eerst alle accountdata — alleen op dit testaccount!): `POST /api/admin/seed` body `{ "persona": "compleet" }`. Keuzes: `daan|lisa|willem|marijke|compleet`. Voor MIJN is `compleet` (Tessa, household_type gezin) de juiste basis.

**UAT-ronde aanmaken + resultaten registreren** (via `mcp__chrome-devtools__evaluate_script`, ingelogd in de browser):
```js
// 1. ronde
const r = await fetch('/api/admin/uat/rounds', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ label:'MIJN live-run — <datum>', environment:'test', notes:'…' }) })
const { round } = await r.json()   // round.id

// 2. per scenario (sub 'a', platform 'webapp'):
await fetch('/api/admin/uat/results', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ round_id: round.id, scenario_id:'UAT-MIJN-01', sub:'a', platform:'webapp',
    status:'geslaagd',            // 'geslaagd' | 'gefaald' | 'geblokkeerd'
    severity:'S2',                // VERPLICHT als status==='gefaald' (S0|S1|S2|S3)
    faalstap:'…', opmerking:'…', frictie:'…' }) })  // laatste 3 optioneel
```
Daarna `/beheer/uat` → ronde selecteren; drill-in per zone toont de bepalende (rode/oranje) stappen. **Let op:** in dev triggert file-editing hot-reload die de plaat-state remount (round/drill reset) — lees de staat via `evaluate_script` op een schone mount i.p.v. screenshot vlak na een edit.

**Efficiënt & eerlijk verifiëren:** gebruik `evaluate_script` met text-presence-checks (`document.body.innerText.includes(...)`) i.p.v. dure full-page screenshots; alleen screenshotten waar visuele bevestiging nodig is. Registreer alleen wat je écht geverifieerd hebt (geen groen-theater).

**MIJN — scenario's die LIVE geblokkeerd zijn (tweede account/partner nodig; markeer `geblokkeerd` met reden):**
UAT-MIJN-04 (partner uitnodigen — invite start kan solo, accept niet), 05 (uitnodiging ontvangen), 06 (huishouden verlaten), 08 + 09 (gezamenlijk budget merge-wizard + afhandelen), 21 (partner-transactiemeldingen), 29 (uitnodiging intrekken — vereist pending invite). Deze zijn engine-technisch al bewezen (computeSharePct), maar de live-UI vereist een echt tweede account + geaccepteerd huishouden. **Maak geen echt tweede auth-account aan zonder expliciete opdracht** (stateful/outbound).

**BEHEER — let op destructieve/stateful tools** (aftikken ≠ uitvoeren waar dat data raakt): WF-BEHEER-08 (account definitief verwijderen), 20 (persona-seed — wist data), 22 (onboarding-reset eigen account), 24 (check-in-snapshots wissen), 25 (regressietest draaien — mag), 06 (AI-kill-switch — niet live togglen op prod-config). Verifieer rendering/bereikbaarheid; voer destructieve acties niet echt uit.

---

## 4. Bug-bijvangst → Notion (verplicht per gevonden defect)

Elke bug → kaart in de **Trifinity-database**: `collection://d87e54c5-fb52-4607-a72a-52e4b58ee806`.
- Properties: titel = **Feature**; **Type**="Bug"; **Tags**=`["MIJN"]` of `["BEHEER"]` (+ evt. "Backend"/"UX"); **Status**="Nieuw"; **Severity** (`S0 - blocker`|`S1 - high`|`S2 - medium`|`S3 - low`); **CC-actie**="Backlog"; velden **Steps to reproduce** / **Expected result** / **Actual result** / **Analyse & voorstel**.
- **Kruisverwijzing (heen én weer):** verwijs in de kaart naar de UAT-workflow (WF-MIJN/BEHEER-NN) én noteer de kaart terug als comment op de zone-kaart. Zoek de zone-kaarten met Notion-search "MIJN UAT" / "BEHEER UAT" (de BELAST-zonekaart was `395f9e8d-568a-8122-a7ee-d29ad2673cea` — MIJN/BEHEER hebben vergelijkbare kaarten).

**Referentie — BELAST leverde 3 bugs op** (zelfde zone-familie, ter context):
- WF-BELAST-13 Box 2-aanslag geen datapad → €0 (S2) — `app/api/household/box2/route.ts` r128 `disposal_gain:0` hardcoded.
- WF-BELAST-14 DGA-leengrens subtype-filter (`dga_lening` vs `rekening_courant`) + teken omgekeerd (S2) — `app/api/household/box2/route.ts` r63-64/r79-93.
- WF-BELAST-10 jaarruimte-cap €1-afronding (S3) — `lib/jaarruimte.ts`. **Let op:** MIJN-checks gebruiken dezelfde €35.588 (consistent).

---

## 5. Afronding na de live-run (nog te doen)

1. Volledige live-run MIJN + BEHEER (+ optioneel de andere grijze zones), rondes geregistreerd.
2. `code-review` op de nieuwe bestanden (was voor BELAST schoon; subagent zodra spendlimiet omhoog).
3. Notion-bugkaarten voor bevestigde discrepanties.
4. Samenvatting + zelfverbeterings-slotstap.
5. **Niets is gecommit** — conform conventie pas op verzoek. Bij shippen: de gewijzigde `test-registry.ts` + `uat-plaat-client.tsx` bevatten óók de eerdere zone-builds van gisteravond (commit-scoping-punt; splits desgewenst per zone/onderwerp af).

---

## 6. Snelle checklist om te hervatten

- [ ] Chrome-venster op het devtools-profiel gesloten (blokkade 1).
- [ ] Spendlimiet verhoogd als je subagents/parallel wilt (blokkade 2).
- [ ] `npm run dev` draait op :3000.
- [ ] Bevestig testaccount = `jochen@test.trifinity.nl` (Tessa) — evt. herseeden.
- [ ] `/beheer/uat` → MIJN/BEHEER drill-in werkt (visuele bevestiging; build + tests zijn al groen).
- [ ] Live-run draaien per §3, bugs per §4, afronden per §5.
