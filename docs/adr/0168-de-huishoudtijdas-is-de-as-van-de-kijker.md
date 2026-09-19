---
id: 0168-de-huishoudtijdas-is-de-as-van-de-kijker
title: 'De huishoud-tijdas is de as van de kijker, niet van de oudste partner'
status: aanvaard
date: 2026-09-19
elements: [as-planning, fn-toekomstplannen]
---

# 0168 — De huishoud-tijdas is de as van de kijker

## Context

De gecombineerde huishoudprojectie (`lib/household-projection.ts`, sectie op /toekomst)
draaide op de tijdas van de **oudste** partner: een v2-erfenis uit de tijd dat de
dual-AOW-omrekening in de app zelf gebeurde. De canonieke FIRE-run op /overzicht
(`computeHorizonFireSim(supabase, 'household')`) draait sinds ADR 0107 op het **eigen**
profiel. Is de kijker de jongste, dan verschillen de assen — en dus het getoonde
leeftijdsgetal — tussen beide oppervlakken (TPR-07 fase 1 sloot de grondslag, niet de as).

De horizon-kernel dwingt de keuze niet af: de PT-laag (`tables/pt.ts#computePartnerHead`)
rekent de partner-drempels als maandindex t.o.v. de head; een oudere partner geeft een
drempel ≤ 0 en werkt gewoon (fixture `B10 = −24`).

## Besluit

1. **Head = de kijker, overal** (optie A). De sectie kiest `headDobEntry` op `user.id`; de
   canonieke run draaide al zo. Eén as per kijker, en de run draait op de eigen
   instellingen (eindstrategie, woning, box 3, onttrekkingsprofiel).
2. **"Oudste overal" (optie B) is afgewezen**: de canonieke run zou dan op het profiel van
   de partner draaien — velden die de RPC `household_member_profiles` bewust niet vrijgeeft
   (privacy-verbreding), en freedomPct/gezondheidsscore/AI-context kregen de leeftijd van
   de partner terwijl de wizard de eigen instellingen bewerkt.
3. **Huishoud-FIRE-leeftijd altijd als kalenderjaar + beide leeftijden.** Twee partners
   zien voor hetzelfde huishouden een ander leeftijdsgetal (zelfde datum); een kale
   leeftijd leest dan als regressie. `household-fire-section.tsx` toont het jaar met
   ieders leeftijd; de kijker is daar de referentie.
4. **Partner-AOW komt uit de bridge.** `KernelUnifiedResult.partnerAowAge = startLeeftijd
   + PT!B11 / 12` (alleen met partnerblok), doorgegeven op `SimResult.partnerAowAge`; de
   grafiek tekent er een read-only marker "AOW partner" mee — geen tweede `lookupAowAge`
   + DOB-offset in de client.
5. **Partner-eventmarkers staan DOB-verschoven op de kijker-as** in de huishoudblik; in de
   partner-view (hoofdlijn = partner-pad) op de opgeslagen partner-leeftijd.
6. **`households.combined_fire_summary` is een restpunt, geen besluit.** De sectie blijft
   de samenvatting schrijven omdat `lib/dashboard-data-loader.ts` de kolom leest voor de
   huishoud-FIRE-velden op /overzicht (security-review 19 sep 2026). Met head = kijker is
   `projection.fireAge` daarin kijker-afhankelijk (laatste schrijver wint; bedragen en
   datums niet). Structurele fix, eigen kaart: de dashboard-loader consumeert de canonieke
   huishoud-run (ADR 0107) i.p.v. de kolom; daarna vervallen kolom + RPC (nu nog
   `GRANT … TO authenticated` met vrije jsonb) via een schemawijziging.

## Gevolgen

- De jongste partner ziet op /toekomst een andere (lagere) huishoud-FIRE-leeftijd dan
  voorheen — zelfde datum, eigen as. Kalenderjaar tonen is daarom verplicht.
- De eigen overlay op /toekomst is niet langer "alleen als je de oudste bent".
- Spiegelfixture (kijker jongste) in `convergentie-router.partner.test.ts` bewijst dat de
  kern een oudere partner aankan en dat hoofdgrafiek ≡ sectie blijft.
- De browser-hoofdrun op /toekomst draagt geen partnerblok (`rawContextZonderPartner`);
  de partner-AOW-marker komt daarom uit de gecombineerde sectie-run
  (`HouseholdProjectionResult.combined.partnerAowAge`), niet uit de pagina-sim.
- Open (TPR-07 fase 2b/2c): de huishoud-uitgavenmethode en de partner-eigen
  levensgebeurtenissen via het partnerblok; het partner-stopmoment is een eigen
  schemawijziging-kaart.
