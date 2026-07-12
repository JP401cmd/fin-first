---
id: 0037-post-fire-basissalaris-fire-gegate-bridge
title: 'Post-FIRE basissalaris is een latent Excel-oracle-artefact — gegate in de bridge, niet in cf.ts'
status: accepted
date: 2026-07-12
elements: [as-planning, fn-toekomstplannen]
---

# 0037 — Post-FIRE basissalaris FIRE-gegate in de kernel-bridge

## Context

`lib/horizon-kernel/bridge.ts` vertaalt de rauwe grootboek-rijen (`cf.ts`, de
Excel-oracle-implementatie) naar `UnifiedProjectionRow.grossIncomeBySource` voor
de app-consumers. De Excel-oracle (`CF!D`, het basissalaris-inkomen) loopt
**onvoorwaardelijk door** — ook ná de FIRE-datum. In het parity-grootboek zelf
is dat onschadelijk: `F` (sparen) wordt 0 zodra iemand FIRE is en `CF!D` wordt
nergens van de onttrekkingsbehoefte afgetrokken, dus de netto-vermogens-
trajectorie was altijd correct (735-fixture-parity byte-groen, netWorth-
invariant bewezen).

Het werd wél zichtbaar zodra de app-zijde `grossIncomeBySource.salaris` los
ging **rapporteren** (levensinkomenstrook/dekkingsgraad-strook,
dekkingsradar-pensioeninkomen-as, scenario-presets-stop-kaarten): die lazen het
post-FIRE-basissalaris als een reëel doorlopend inkomen, waardoor de dekking
bij een te vroege stopleeftijd nooit onder 100% kwam — een phantom-salaris-lek
in de rapportage, niet in de trajectorie.

## Besluit

`grossIncomeBySource.salaris` wordt in `bridge.ts` (~r399-418) FIRE-gegate op
`fireMonth`: de user-basissalaris-term (de CF!D-term
`(nettoJaarinkomen/12)·(1+inflatie)^(m/12)`) wordt exact afgetrokken zodra de
maand voorbij `fireMonth` ligt. Partnerinkomen (`PT!K`) en de werk-delta
(inkomens-sliders/presets die al langs het salariskanaal lopen, zie ADR
"wat-als-scenario" / slider-werk-gate) blijven **ongewijzigd** meetellen — dit
besluit gate't specifiek en uitsluitend de user-basissalaris-term.

**Dit wordt NOOIT "richting oracle" in `cf.ts` zelf gefixt.** `cf.ts` blijft
`CF!D` byte-exact volgen (dat is precies wat de 735-fixture-parity-suite
vastpint); de gate zit uitsluitend in de bridge, ná de oracle-rekenstap, als
een presentatie-/rapportage-correctie op de afgeleide `UnifiedProjectionRow`.

Alle consumers erven de gate automatisch via het ene bridge-veld — geen aparte
fixes nodig in `coverage-strip.ts`, `dekkingsradar.ts`, de fase-modals, de
regime-kaart of `income-expense-breakdown`.

## Alternatieven overwogen

- **CF!D in `cf.ts` zelf op 0 zetten ná FIRE.** Verworpen: `cf.ts` is de
  Excel-oracle-implementatie; elke afwijking daar breekt de 735-fixture-
  parity-tests tegen de Excel v5-fixtures (zelfde categorie fout die ADR 0033
  expliciet vermeed door de tekort-aflossing wél in de kernel maar áchter een
  schakelbare vlag te zetten — hier is zelfs geen vlag nodig omdat de gate
  puur in de afleiding zit, niet in het grootboek).
- **Per-consumer patchen (coverage-strip, dekkingsradar, scenario-presets
  los).** Verworpen: drie tot vijf plekken zouden dezelfde `fireMonth`-check
  moeten herhalen — een garantie voor toekomstige drift zodra een nieuwe
  consumer wordt toegevoegd. De bridge is de ene plek waar rauwe grootboek-
  rijen de app-vorm aannemen.

## Gevolgen

- Positief: de levensinkomenstrook en de dekkingsradar-pensioeninkomen-as
  tonen nu daadwerkelijk <100% bij een te vroege stopleeftijd — het
  phantom-salaris maskeerde dat eerder. De scenario-presets-stopkaarten
  (`runForcedStopPath`) erven dezelfde correctie zonder eigen wijziging.
  735-parity blijft byte-groen; netWorth-invariant blijft bewezen (de fix
  raakt alleen de inkomens-rapportage, niet de trajectorie).
- Kosten/schuld: het salaris-kanaal kent nu twee gate-mechanismen naast elkaar
  — de reeds bestaande dynamische kern-FIRE-gate op het sparen (`CF!D → F`,
  0 ná FIRE binnen het grootboek zelf) en deze expliciete rapportage-gate in
  de bridge. Beide moeten in de gaten gehouden worden als `fireMonth` ooit
  van betekenis verandert.
- Bekend, bewust buiten scope: `slider:extra_inleg` lekt nog steeds
  levenslang (zie de wat-als-scenario-calc-note, follow-up); dit besluit
  raakt alleen het basissalaris-kanaal.
