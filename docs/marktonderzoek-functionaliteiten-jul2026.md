# Marktonderzoek functionaliteiten — juli 2026 (refresh)

**Vraag:** welke functionaliteiten bieden toonaangevende FIRE-planningstools, internationale PFM-apps en Nederlandse geld-apps in 2025–2026, en wat missen wij?

**Methode:** deep-research-harnas (103 agents, 5 zoeksporen, 21 bronnen gefetcht, 105 claims geëxtraheerd, top-25 adversarieel geverifieerd met 3 stemmen per claim → **20 bevestigd, 5 weerlegd**). Anders dan het juni-onderzoek is dit keer óók de TriFinity-kant **tegen de codebase geverifieerd** — elke "wij missen X"-uitspraak hieronder is gecheckt tegen de werkelijke code per 12 juli 2026.

**Relatie tot eerder werk:** dit is een refresh + verdieping van het juni-2026-onderzoek dat de roadmap in `lib/roadmap-functionaliteiten.ts` (zichtbaar op `/beheer/roadmap`) opleverde, en vult de Boldin-inspiratielijst (`docs/reviews/external-boldin-2026-05-08-features.md`) aan.

---

## 1. Managementsamenvatting

Toonaangevende FIRE-planners investeerden in 2025–2026 zwaar in **drie richtingen**:

1. **Dynamische onttrekking & guardrails** — Guyton-Klinger, VPW, ratcheting, flex-spending met gedragsregels (ProjectionLab Flex Spending okt 2025; Boldin Spending Guardrails maart 2026). **TriFinity dekt dit grotendeels al**, en dieper dan de markt: onze Guyton-Klinger-guardrails zitten geïntegreerd in de rekenkern (`lib/withdrawal-strategy.ts`) i.p.v. als losse verkennende modus, en het guardrail-kompas (`lib/horizon/guardrail-bounds.ts`) is functioneel equivalent aan Boldins Spending Guardrails Insight.
2. **Geautomatiseerde fiscale-strategie-optimalisatie** — ProjectionLab v4.6.0 (apr 2026): kies een doel (belastingschijf, subsidieklif) en de tool optimaliseert Roth-conversies/withdrawal-volgorde binnen de simulatie, met een Optimize-functie en Compare-heatmap. **Dit is ons grootste echte gat** — wij berekenen belasting (diep), maar optimaliseren niet. De NL-invulling (Box 3-peildatum, jaarruimte-benutting, fiscale partnerverdeling) ligt open en past exact op onze bestaande motoren.
3. **Nieuwe inzicht-oppervlakken** — Sankey-cashflow (Boldin feb 2026; **wij hebben inmiddels drie Sankeys**) en plan-als-document (Boldin "View Full Plan" juli 2026; **ons persoonlijk-plan-rapport dekt bewust alleen de input-zijde** — het projectie-/inzichtdeel ontbreekt).

**Thuismarkt-alarm:** ProjectionLab modelleert sinds v4.4.0 (okt 2025) expliciet **Nederlandse Box 3-vermogensbelasting** met forfaitaire rendementen, heeft een dedicated `/netherlands`-landingspagina en maakte belastingestimatie gratis. Nog zonder jaarruimte/tegenbewijs/Box 1-diepte — onze fiscale voorsprong staat, maar de exclusiviteit erodeert.

**Mainstream-PFM-les:** Monarch schoof op naar FIRE-aangrenzende scenarioplanning als **premium-upsell** (Forecasting apr 2026; Monarch Plus $199/jr naast Core $99,99/jr). Planning-diepte — precies wat wij gratis weggeven — is in de markt dé betaalmuur.

**Roadmap-stand:** 3 van de 9 juni-gaps zijn inmiddels gebouwd (B vaste-lasten-actielaag, D plan-brede slagingskans, G Sankey), 1 deels (I allocatie). De rest blijft staan, aangescherpt met nieuw bewijs.

**Blinde vlek gedicht (addendum 12 jul):** het community-spoor is alsnog uitgevoerd als direct bronnenonderzoek (r/DutchFIRE via browser, Geldnerd-artikelen + reacties, NL-blogs/fora) — zie §3 spoor 4. Uitkomst: spreadsheets domineren (Geldnerd-calculator is 4 jaar onbeheerd = migratie-kans), veel van onze features worden bevestigd, en er kwamen vier community-onderbouwde gaps boven (DEGIRO-import, per-jaar-overrides, nabestaanden-scenario, Box 3-transitie 2026→2028) — bewust nog niet op de backlog gezet.

---

## 2. Stand van de juni-roadmap (A–I), code-geverifieerd

| Item | Titel | Status juli 2026 | Bewijs |
|---|---|---|---|
| A | PSD2-bankkoppeling live | **Open (activeren)** — code is verder: TrueLayer-flow live-gefixt (10 jul), blokkade blijft de productbeslissing (Connected `available:false`) | `lib/truelayer/**`, `lib/subscription-catalog.ts` |
| B | Vaste-lasten-actielaag | **Gebouwd** — OpzegModal + opzeg-acties via actielijst | `components/app/opzeg-modal.tsx`, `lib/cancellation-types.ts` |
| C | Partner-samenwerkingslaag | **Open** — verfijnd door Monarch Shared Views (zie §4.7) | `app/api/household/**` |
| D | Plan-brede slagingskans | **Gebouwd** — kernel-Monte-Carlo met `successProbability` over het hele plan, geconsumeerd in horizon/whatif-UI | `lib/horizon-kernel/wrappers/mc.ts`, `lib/architecture/calculations.ts` |
| E | Risico-APK | **Open** | — |
| F | Pensioenaggregatie 2e pijler | **Open** — versterkt: Boldin toont dat pensioen-stacking + fiscale optimalisatie één samenhangende laag vormen | `annuitizePension` bestaat; instroom ontbreekt |
| G | Sankey-cashflowdiagram | **Gebouwd** — drie oppervlakken | `components/app/horizon/horizon-cashflow-sankey.tsx`, `budget-sankey.tsx`, `cash-account-view.tsx` |
| H | Per-rekening-privacy | **Open** | — |
| I | Portefeuille-allocatiemodellering | **Deels** — rendement per categorie zit sinds juli in het wat-als-lab | `lib/horizon/toekomst-scenario.ts` |

---

## 3. Bevindingen per spoor (geverifieerd, met bronnen)

### Spoor 1 — FIRE-planningstools (ProjectionLab, Boldin)

**3.1 · Selecteerbare klassieke onttrekkingsstrategieën zijn marktstandaard** *(3-0 geverifieerd)*
ProjectionLab biedt een dedicated Withdrawal Strategy-modus met Initial Percentage, Ratcheting SWR, VPW en Guyton-Klinger, vanaf een gekozen jaar of mijlpaal. Nuance uit de primaire bron: het is een *verkennende* modus die reguliere plan-events overschrijft — geen geïntegreerde plan-onttrekking.
→ *TriFinity:* ✅ grotendeels gedekt, architectonisch zelfs dieper: `static` (SWR/annuïteit) + `guardrails` (Guyton-Klinger) zitten **in de engine zelf** (`lib/withdrawal-strategy.ts`); VPW/bucket zijn bij migratie `20260703115225` bewust in `static` samengevoegd. Ratcheting ontbreekt als benoemde optie — klein, geen prioriteit.
Bronnen: [projectionlab.com/help/withdrawal-strategy-mode](https://projectionlab.com/help/withdrawal-strategy-mode), [projectionlab.com/help/using-what-if](https://projectionlab.com/help/using-what-if)

**3.2 · Guardrails-"veilig te besteden" en flex-spending zijn de actieve featuregolf** *(3-0)*
Boldin lanceerde 12 maart 2026 de Spending Guardrails Insight (veilig-besteedbaar bedrag rond ~80% slagingskans, met boven-/ondergrenzen). ProjectionLab shipte Flex Spending (v4.4.0, okt 2025): bestedingen dynamisch aanpassen op portefeuilleprestatie via gebruikersregels ("markt −30% vanaf ATH → discretionair −60%") met essential/discretionary-splitsing.
→ *TriFinity:* 🟡 het guardrail-kompas (`lib/horizon/guardrail-bounds.ts`, juli 2026) levert exact de vier bestedingsniveaus (te weinig / veilig / gepland / meevaller) — equivalent aan Boldins insight. Wat mist: **gedragsregels die de must/nice-splitsing** (die onze budgetten al hebben, `budget_type`) **koppelen aan portefeuilleprestatie** in de projectie. Bouwstenen liggen klaar.
Bronnen: [boldin.com/retirement/release-notes](https://www.boldin.com/retirement/release-notes/), [projectionlab.com/help/flex-spending](https://projectionlab.com/help/flex-spending), [projectionlab.com/blog/whats-new-v440](https://projectionlab.com/blog/whats-new-v440)

**3.3 · ProjectionLab betreedt de NL-markt met Box 3-modellering** *(3-0)*
v4.4.0 (13 okt 2025): "Netherlands Wealth Tax (Box 3): Improved wealth tax estimation for the Netherlands with deemed return rates and asset categories"; belastingestimatie gratis, 12 landen, dedicated [projectionlab.com/netherlands](https://projectionlab.com/netherlands).
→ *TriFinity:* geen feature-gap maar een **strategisch signaal**: geen bewijs voor jaarruimte, tegenbewijsregeling of Box 1/2-diepte bij ProjectionLab — onze fiscale diepte blijft vooralsnog uniek, maar is niet langer exclusief NL-onbetreden terrein.
Bron: [projectionlab.com/changelog](https://projectionlab.com/changelog)

**3.4 · Geautomatiseerde fiscale-strategie-optimalisatie is de nieuwe frontlinie** *(3-0)*
ProjectionLab v4.6.0 (20 apr 2026): kies een doel (federale schijf, IRMAA-klif, ACA-subsidielimiet, inkomensdrempel) en de simulatie voert opportunistisch Roth-conversies, withdrawal-shielding en gain-harvesting uit; met Optimize (beam search), een Compare-heatmap van strategieën en inkomens-bewuste withdrawal-splitsing voor paren. Boldin heeft dezelfde diepte via de Roth Conversion Explorer (Tax Bracket Limit / IRMAA Bracket Limit / Lowest Lifetime Tax Liability), actief doorontwikkeld dec 2025–feb 2026.
→ *TriFinity:* ❌ **grootste nieuwe gap.** Wij *berekenen* Box 1/2/3, jaarruimte en tegenbewijs — maar *optimaliseren* niets. De NL-analoog is goud: doelgerichte Box 3-peildatumoptimalisatie, jaarruimte-benutting ("€X inleggen bespaart €Y = Z vrijheidsdagen"), fiscale partnerverdeling (verdeling grondslag sparen & beleggen), onttrekkingsvolgorde over potten. Alle motoren bestaan al (`lib/box1-tax.ts`, `lib/box3-data.ts`, jaarruimte, kernel) — het gat is de optimalisatie-laag erbovenop.
Bronnen: [projectionlab.com/blog/whats-new-v460](https://projectionlab.com/blog/whats-new-v460), [help.boldin.com/en/articles/6888336](https://help.boldin.com/en/articles/6888336)

**3.5 · Sankey bevestigd als geshipte marktstandaard** *(3-0)*
Boldin releasede 23 feb 2026 een Sankey Cashflow Insight (live onder Insights → Lifetime Cash Flow).
→ *TriFinity:* ✅ gebouwd — drie oppervlakken (horizon-jaardetail, budget, rekening). Juni-gap-item G kan als gerealiseerd worden gemarkeerd.

**3.6 · NIEUW gap-item: plan-als-document** *(3-0)*
Boldin lanceerde 6 juli 2026 "View Full Plan": één document-stijl weergave van het volledige plan — kerncijfers, grafieken en tabellen mét context en inzichten verweven. Nuance: evolutie van hun bestaande My Plan Summary.
→ *TriFinity:* 🟡 ons persoonlijk-plan-rapport (`lib/persoonlijk-plan-data.ts`, `/rapportages/persoonlijk-plan`) is **bewust alleen de input-zijde** ("welke aannames sturen de berekeningen — geen toekomstprojectie"). Het deelbare/printbare *totaalplan* — inputs + projectie + slagingskans + inzichten als één document, bv. voor je partner of een adviseur — ontbreekt. Sterke kandidaat: bouwt op bestaand rapport + kernel + rapportages-shell.
Bron: [boldin.com/retirement/release-notes](https://www.boldin.com/retirement/release-notes/)

### Spoor 2 — Internationale PFM-apps (Monarch, Origin)

**3.7 · Monarch zet de AI-engagement-benchmark: gegronde assistent + Weekly Recap als gesloten loop** *(3-0)*
Winter Release (18 dec 2025): in-app AI Assistant gegrond in eigen data (gemarket als gevormd door een CFP/CFT/PhD-panel — framing, geen feit) plus Weekly Recap: gepersonaliseerde weeksamenvatting op het dashboard **én per e-mail**, met de assistent beschikbaar voor vervolgvragen op de recap.
→ *TriFinity:* 🟡 chat + wekelijkse briefing bestaan en zijn marktconform; wat mist is de **gesloten loop**: onze briefing verlaat de app niet (e-mail wordt alleen voor huishouduitnodigingen gebruikt — `lib/email.ts`) en heeft geen "bespreek dit met Will"-brug vanuit een e-mail. Retentie-mechaniek, geen rekenwerk.
Bronnen: [monarch.com/blog/winter-release](https://www.monarch.com/blog/winter-release), help.monarch.com

**3.8 · Planning-diepte is dé premium-upsell** *(3-0)*
Monarch Forecasting (13 apr 2026): scenario's op echte accountdata (pensioen, huis, career break), gevolgd door premium-tier Monarch Plus ($199/jr vs Core $99,99/jr) die Forecasting + retirement planning bundelt.
→ *TriFinity:* strategisch — ons wat-als-lab, Monte Carlo en backtesting zijn t.o.v. mainstream PFM een **voorsprong die wij gratis weggeven**. Bij de commerciële lancering (Polar) is planning-diepte de bewezen betaalmuur; onze huidige add-ons (AI €9 / Connected €4) monetariseren juist níet onze sterkste laag.
Bronnen: [monarch.com/whats-new](https://www.monarch.com/whats-new), [monarch.com/pricing](https://www.monarch.com/pricing)

**3.9 · Partner-gap verfijnd: eigenaarschap op transactieniveau + regels** *(3-0)*
Monarch Shared Views (30 okt 2025): yours/mine/ours-labels op rekeningen én individuele transacties, filterbare perspectieven en **rule-based automatisering** van die labels.
→ *TriFinity:* 🟡 het 3-perspectievenmodel en `ownership` (personal/shared) op transacties bestaan al; import leidt eigenaarschap af. De resterende gap is smal en precies: **regel-automatisering van eigenaarschap** + review-tagging tussen partners (dat laatste was al de kern van juni-item C).
Bron: [monarch.com/blog/shared-views](https://www.monarch.com/blog/shared-views)

**3.10 · Origin: AI-advies onder SEC-toezicht** *(2-1 — superlatief is marketing)*
Origin lanceerde sep 2025 een AI financial advisor geleverd via een echte SEC-geregistreerde RIA (CRD #305353, onafhankelijk geverifieerd). Het "first full-spectrum"-superlatief is persbericht-framing.
→ *TriFinity:* marktbeweging die de bestaande strategische noot bevestigt: generieke AI-geldcoaching commoditiseert; gereguleerd advies is een andere business. Onze Wft-grens (geen persoonlijk advies) blijft de juiste keuze; de moat is NL-datadiepte + filosofie.
Bron: [businesswire.com (9 sep 2025)](https://www.businesswire.com/news/home/20250909759834/en/), SEC IAPD

### Spoor 3 — Nederlandse markt

**3.11 · Dyme is overgenomen, niet gestopt** *(3-0)*
Sep 2025: overname door insurtech RISK (miljoenendeal); merk en team (~20 fte) blijven, winstgevend in 2024, Duitse expansie gepland. Adoptie-benchmark: **600.000 ooit-gekoppelde bankrekeningen, 150.000 maandelijks actieven** (bedrijfsgerapporteerd, in overname-PR-context). Let op: de eerdere claim "Dyme's opzegservice bespaarde €40M+" overleefde verificatie **niet** (1-2) — dat cijfer niet meer gebruiken als onderbouwing van roadmap-item B.
Bron: [emerce.nl](https://www.emerce.nl/nieuws/dyme-verkocht-insurtech-risk-miljoenendeal)

**3.12 · Voorspelde uitgaven zijn gratis bank-baseline** *(3-0)*
Per aug 2025 bieden alle vier grote NL-bankengroepen voorspelde-uitgaven-features: Rabobank "Kijk vooruit" (default aan), SNS/ASN "Kijk vooruit" (aan, niet uitschakelbaar), ING "Kijk Vooruit" (default uit), ABN AMRO "Inzicht" (default uit). Methodiek: aangekondigde incasso's (3–5 dagen vooraf) + patroonherkenning (ING: 35 dagen vooruit).
→ *TriFinity:* de lat voor onze cashflow-forecast ligt bij **méér dan voorspellen** — vrijheidstijd-framing, actielaag en scenario-koppeling zijn de onderscheiders; het voorspellen zelf is commodity die NL-gebruikers gratis van hun bank kennen.
Bron: [seniorweb.nl (25 aug 2025)](https://www.seniorweb.nl/artikel/voorspelde-uitgaven-in-bank-apps) + primaire bankpagina's

### Spoor 4 — FIRE-community (blinde vlek GEDICHT — addendum 12 jul 2026)

De deep-research-verificatie killde forumclaims twee keer; daarom is dit spoor op 12 juli alsnog uitgevoerd als **direct bronnenonderzoek** (drie parallelle lees-agents). Methodische noot: Reddit is voor WebFetch/WebSearch volledig geblokkeerd — de werkende route was de echte browser (chrome-devtools → old.reddit.com). Gelezen: de r/DutchFIRE-tools-wiki + 4-7 threads (incl. comments), de Geldnerd FIRE Calculator-artikelen mét reacties, en NL-blogs/fora (FOB, PorteRenee, Radar, IEX, dejongebelegger, LLMM).

**Wat de community werkelijk gebruikt:** spreadsheets domineren — eigen Excel/Google Sheets, het mr. FOB-huishoudboekje en de **Geldnerd FIRE Calculator** (drie-pijler-gat-model: AOW + factor A + pijler 3, jaarbasis, deterministisch, mét handmatige per-jaar-overrides in het Data-werkblad). De maker verklaarde 'm in 2022 zelf fiscaal verouderd (Box 3-hervorming + nieuw pensioenstelsel) en stopte; de tool is vier jaar onbeheerd — een migratie-kans. De community-wiki cureert slechts twee tools: **Early Retirement Calc** (NL, mét toekomstig werkelijk-rendement-stelsel — te monitoren concurrent) en FIRECalc. Portfolio-trackers: PDT (€75/jr), Delta, Portfolio Performance. **DEGIRO is verreweg de meest besproken broker** — geen enkele tracker dekt 'm moeiteloos.

**Klachten & spreadsheet-redenen:** flexibiliteit ("variabele bedragen per jaar" → Geldnerds Data-werkblad is dé killer-feature), wantrouwen in cloud-vergankelijkheid ("misschien stopt ProjectionLab er over 10 jaar mee en dan ben je alles kwijt"), privacy (bankdata, deel-links die naam/e-mail lekken), Excel-macro-pijn op Mac/Sheets. Ook: gezonde scepsis over óverplanning ("zet een redelijke stip op de horizon, en ga gewoon varen") — validatie van de Eenvoudig-weergave.

**Bevestigde dekking** (community wil het, wij hebben het): auto-import + AI-categorisatie, Monte Carlo/backtesting (sequence-of-returns-zorg), NL-fiscaliteit in de projectie incl. AOW-brug, deeltijd-scenario's, jaarruimte/factor A, rendements-gevoeligheid, multi-rekening-vermogen.

**Vier community-onderbouwde gaps** (12 jul besproken; bewust — op verzoek gebruiker — nog NIET als backlog-kaarten aangemaakt):

| # | Gap | Bewijs | TriFinity-stand |
|---|---|---|---|
| C1 | **DEGIRO-import** (CSV incl. dividenden/kosten) | Meest besproken broker r/DutchFIRE; "handig als tracker importfunctionaliteit heeft"; DEGIRO toont zelf geen rendementsbeeld | Alleen generieke broker-CSV (`lib/parsers/broker-csv.ts`) |
| C2 | **Per-jaar-overrides in de projectie** | Geldnerd Data-werkblad = killer-feature; reageerderswens "variabele bedragen per jaar" | Wat-als-sliders + levensgebeurtenissen, geen vrije jaar-cel |
| C3 | **Partner-overlijden/nabestaandenpensioen-scenario** (= roadmap-item E) | Láátste feature-request aan de Geldnerd-calculator (incl. AOW-knik nabestaandenpensioen) | Data wordt al geparsed (`lib/pension/**`), scenario ontbreekt |
| C4 | **Box 3-stelseltransitie 2026→2028** (Wet werkelijk rendement) | Heetste thread (322 punten, eigen Python-simulatie); Early Retirement Calc heeft het al; Geldnerd-calculator stierf eraan | Huidig stelsel + tegenbewijs; transitie ontbreekt; koppelt aan J |

**Prijs-sentiment:** gangbare band €4–9/mnd (PDT €75/jr, Delta PRO €54/jr, Dyme €45–60/jr); eenmalige sheets €15–20. TriFinity's AI-add-on (€9) zit aan de bovenkant.

---

## 4. Gap-matrix (research-bevindingen × code-geverifieerde TriFinity-status)

| # | Feature (markt) | Status | Toelichting |
|---|---|---|---|
| 1 | Klassieke onttrekkingsstrategieën (VPW/GK/ratcheting) | ✅ | `static`+`guardrails` in de engine; VPW bewust samengevoegd; ratcheting ontbreekt (verwaarloosbaar) |
| 2 | Guardrails-"veilig te besteden"-insight | ✅ | Guardrail-kompas = equivalent (juli 2026) |
| 3 | Flex-spending-gedragsregels (must/nice × portefeuille) | 🟡 | must/nice bestaat (`budget_type`), guardrails bestaan; de koppeling als regels in de projectie ontbreekt |
| 4 | Fiscale-strategie-optimizer (doel + Optimize + Compare) | ❌ | **Grootste gap.** NL-invulling: Box 3-peildatum, jaarruimte-benutting, partnerverdeling, onttrekkingsvolgorde |
| 5 | Sankey-cashflow | ✅ | Drie oppervlakken gebouwd |
| 6 | Plan-als-document (totaalplan, deelbaar) | 🟡 | Persoonlijk-plan-rapport = alleen input-zijde; projectie+inzichten-deel ontbreekt |
| 7 | Weekly-recap gesloten loop (e-mail + AI-follow-up) | 🟡 | Briefing bestaat; e-mail-kanaal en terug-de-app-in-brug ontbreken |
| 8 | Transactie-eigenaarschap yours/mine/ours + regels | 🟡 | ownership bestaat; regel-automatisering + partner-review-tagging ontbreken (= juni-item C, versmald) |
| 9 | Plan-brede slagingskans | ✅ | Kernel-MC `successProbability` (juni-item D gerealiseerd) |
| 10 | Vaste-lasten-actielaag | ✅ | OpzegModal + acties (juni-item B gerealiseerd) |
| 11 | Voorspelde uitgaven | ✅ | Cashflow-forecast bestaat; bank-apps zijn de gratis baseline — differentieer op framing/actie |
| 12 | Gereguleerd AI-advies (Origin-model) | 🚫 | Bewust niet: Wft-grens, moat = datadiepte + filosofie, niet advies |
| 13 | Planning-diepte als premium-tier | strategisch | Prijsmodel-vraag bij Polar-lancering, geen feature |

---

## 5. Aanbevolen roadmap-verversing

**Tier 1 — Nu:**
- **A · PSD2 activeren** (ongewijzigd; tekst gecorrigeerd: TrueLayer, niet GoCardless; Dyme-benchmark 600k/150k als adoptie-referentie)
- **J · NL fiscale-strategie-optimizer** *(nieuw — het grootste onvervulde gat, direct op onze sterkste motoren)*
- **C · Partner-samenwerkingslaag** (versmald: review-tagging + eigenaarschap-regels + gezamenlijke check-in; het perspectievenmodel staat er al)
- **F · Pensioenaggregatie 2e pijler** (promotie van Tier 2 → Tier 1: Boldin bewijst dat pensioen-stacking + fiscale optimalisatie één samenhangende laag is; koppelt aan J)

**Tier 2 — Verdieping:**
- **K · Plan-als-document** *(nieuw)* — persoonlijk-plan-rapport uitbreiden met projectie/slagingskans/inzichten
- **L · Briefing-e-mail-loop** *(nieuw)* — weekly recap per e-mail met terug-de-app-in-brug naar Will
- **M · Flex-spending-regels** *(nieuw, klein)* — must/nice × portefeuilleprestatie in de projectie
- **E · Risico-APK** (ongewijzigd)
- **H · Per-rekening-privacy** (ongewijzigd)
- **I · Allocatiemodellering** (rest; rendement-per-categorie is er al)

**Gerealiseerd sinds juni:** B (vaste-lasten-actielaag), D (plan-brede slagingskans), G (Sankey).

**Strategische noten (bijgewerkt):**
1. *ProjectionLab-NL-radar (nieuw):* Box 3-estimatie sinds okt 2025, gratis, eigen NL-landingspagina. Monitoren op jaarruimte/tegenbewijs-uitbreiding — dat zou onze kern-differentiator raken.
2. *Planning als betaalmuur (nieuw):* Monarch Plus bewijst betalingsbereidheid voor scenario-/pensioenplanning ($199/jr). Heroverweeg de tier-indeling vóór de Polar-lancering: onze planning-diepte is nu gratis.
3. *AI-moat: diepte, geen breedte* (blijft; Origin-RIA-lancering bevestigt het).
4. *PSD3/FIDA-radar* (blijft).
5. *Community-vervolgonderzoek* (blijft, aangescherpt): websearch-verificatie werkt niet voor forumwensen; gericht bronnenonderzoek op r/DutchFIRE/FOB nodig. Geldnerd FIRE Calculator = concreet startpunt.

---

## 6. Weerlegde claims — niet hergebruiken

| Claim | Stem | Waarom relevant |
|---|---|---|
| Monarchs Winter Release bevatte ook goals-redesign/equity-tracking/receipt-scanning | 0-3 | Alleen AI Assistant + Weekly Recap zijn bevestigd |
| Dyme's opzegservice bespaarde consumenten €40M+ | 1-2 | Stond in het juni-onderzoek als marktbasis onder item B — cijfer vervalt (item is inmiddels toch gebouwd) |
| ProjectionLab draait 10.000 MC-runs vs Boldin 1.000 | 0-3 | Geen benchmark voor onze MC-diepte aan ontlenen |
| Boldin $120–480/jr, uitsluitend MC zonder backtesting | 0-3 | bridgetofi-vergelijkingsdata onbetrouwbaar |
| FICalc: vier strategieën, geen belastingen | 0-3 | idem |

## 7. Open vragen

1. ~~**r/DutchFIRE-wensen**~~ — GEDICHT 12 jul via direct bronnenonderzoek (zie §3 spoor 4-addendum). Rest-vraag: Tweakers-forum "Financiële Onafhankelijkheid" bleef ontoegankelijk (crawler-block).
2. **Hoe snel verdiept ProjectionLab zijn NL-modellering?** (houdbaarheid fiscaal thuisvoordeel) — plus nieuwe NL-concurrent om te monitoren: **Early Retirement Calc** (heeft het toekomstige werkelijk-rendement-stelsel al ingebouwd, staat in de r/DutchFIRE-wiki)
3. **Niet-gedekte tools** — cFIREsim, FICalc, WealthTrace, Empower, YNAB, Copilot, PocketSmith, Buddy, Flow, Peaks, bunq: afwezigheid van bevindingen ≠ afwezigheid van features.
4. **Betalingsbereidheid NL-FIRE-gebruikers** voor planning-als-premium.

## 8. Beperkingen

Vendor-release-notes zijn betrouwbaar voor "feature X bestaat sinds Y" maar marketing-framing is als framing gemarkeerd; Dyme-cijfers zijn bedrijfsgerapporteerd in PR-context; deze foto is per juli 2026 en veroudert in maanden (Boldin shipt wekelijks). De TriFinity-kant is per 12 juli 2026 tegen de codebase geverifieerd.

## 9. Kernbronnen

ProjectionLab: [changelog](https://projectionlab.com/changelog) · [whats-new-v440](https://projectionlab.com/blog/whats-new-v440) · [whats-new-v460](https://projectionlab.com/blog/whats-new-v460) · [withdrawal-strategy-mode](https://projectionlab.com/help/withdrawal-strategy-mode) · [flex-spending](https://projectionlab.com/help/flex-spending) · [netherlands](https://projectionlab.com/netherlands)
Boldin: [release-notes](https://www.boldin.com/retirement/release-notes/) · help.boldin.com (6888336, 12067360, 12571086, 13822041)
Monarch: [whats-new](https://www.monarch.com/whats-new) · [blog/winter-release](https://www.monarch.com/blog/winter-release) · [blog/shared-views](https://www.monarch.com/blog/shared-views) · [pricing](https://www.monarch.com/pricing)
Origin: [businesswire 9 sep 2025](https://www.businesswire.com/news/home/20250909759834/en/) · SEC IAPD CRD #305353
NL: [emerce.nl Dyme/RISK](https://www.emerce.nl/nieuws/dyme-verkocht-insurtech-risk-miljoenendeal) · [seniorweb.nl voorspelde uitgaven](https://www.seniorweb.nl/artikel/voorspelde-uitgaven-in-bank-apps) · geldnerd.nl (FIRE Calculator)
