---
status: aanvaard
date: 2026-06-14
elements: [as-planning, fn-toekomstplannen]
---

# 0017 — Horizon v2: legacy kiest de vroegst-haalbare FIRE die op/boven het nalatenschapsdoel eindigt

## Context

ADR 0014 legde vast dat de eindstrategie **legacy** in de v2-grootboek-engine
(`lib/horizon-engine/engine.ts`) **need-only** onttrekt: alleen de netto leefbehoefte
wordt onttrokken, het residu blijft belegd en groeit naar de nalatenschap. Dat besluit
blijft staan — `lib/withdrawal-strategy.ts` (`legacyPreserveOnly`) is ongewijzigd.

Bij need-only is de onttrekking na AOW ≈ 0 (pensioen/AOW dekt de uitgaven), dus na
pensioen kan het liquide vermogen alléén stijgen. "Rond het erfenisdoel eindigen" is
daarom uitsluitend haalbaar door FIRE *vroeger* te leggen, zodat de pre-pensioen-
brugjaren het liquide vermogen verder afbouwen. De FIRE-selectie (`meetsStrategyTarget`
+ de zoek-loop in `engine.ts`) deed echter het tegenovergestelde:

- de brug-eis was `minMid > 1` (het liquide pad moest de overbrugging met buffer
  overleven), wat FIRE onnodig laat duwde, en
- de doel-check was `endLiquide ≥ legacyAmount − max(1, 2%)` — een **eenzijdige
  ondergrens mét tolerantie**. De tolerantie liet bovendien een FIRE-leeftijd toe
  waarvan de afbouw-lijn nét **ónder** het nalatenschapsdoel eindigde (gemeten: doel
  €200k, eindwaarde €197.778 — onder doel).

## Besluit

Voor **legacy** in v2 wordt de FIRE-selectie doel-zoekend (alleen de legacy-tak van
`meetsStrategyTarget`; perpetual en deplete blijven byte-identiek):

- **Brug-ondergrens versoepeld:** de brug naar pensioen mág richting €0 dippen — het
  liquide pad mag alleen nóóit **negatief** worden. (`minMid > 1` → "liquide ≥ 0 over
  de hele reeks".) Er is **geen** aparte, gebruiker-instelbare veiligheidsmarge: de
  gewenste buffer verwerkt de gebruiker in het **bedrag** dat hij als erfenis instelt.
- **Bias naar boven, nooit eronder:** de doel-check is `endLiquide ≥ legacyAmount`
  (de −2%-tolerantie vervalt). Omdat het eindvermogen monotoon stijgt in de
  FIRE-leeftijd, levert de bestaande vroegste-eerst-zoeklus (`break` op de eerste
  passerende leeftijd) per constructie de uitkomst die het minst overschiet terwijl
  het doel nét gehaald wordt — "zo vroeg mogelijk, op/boven het doel".
- **Onvermijdelijke overshoot als signaal:** haalt zelfs FIRE = `startAge` (nu stoppen)
  het doel al, dan is dat de uitkomst. Dat is géén `!fireReachable`; het engine-resultaat
  draagt een additief veld `legacyTargetUnavoidablyExceeded: boolean` zodat de UI
  desgewenst "je kunt nu al stoppen" kan tonen.

De onttrekking (need-only, ADR 0014) verandert niet; alleen de selectie-gate in
`engine.ts` wijzigt. INV-4/INV-5 blijven intact (geen bespoke onttrekkings-math in de
jaar-loop; de FIRE-zoektocht is selectie-logica en hoort in de engine).

## Status & scope

- Geldt alleen voor v2 (in productie geforceerd sinds C5-a, ADR 0016). v1
  (`runUnifiedProjection`) en de gedeelde annuïteit-tests blijven ongewijzigd.
- Bewaakt door `test/horizon-engine.test.ts` (legacy doel-zoekend: eindwaarde
  ≥ doel en rond het doel; FIRE-leeftijd-shift; onvermijdelijke-overshoot + signaal;
  perpetual/deplete byte-identiek). `lib/withdrawal-strategy.test.ts` blijft
  ongewijzigd. Catalogus-entry `horizon-grootboek-v2` in
  `lib/architecture/calculations.ts` is bijgewerkt.

## Gevolgen / open

- Een diep dippende brug (richting €0) is financieel fragiel; dit is bewust
  geaccepteerd als gedrag, mits nooit ónder het doel geëindigd wordt en de gebruiker
  zijn buffer in het erfenisbedrag kan verwerken.
- **Belangrijke nuance uit de praktijk (eigen account):** voor een profiel met een
  groot, niet-liquide eigen huis onder een downsize-strategie `on_depletion` die nooit
  triggert, blijft de getoonde **netto-vermogenslijn** ver boven het (liquide)
  nalatenschapsdoel — niet door deze selectie, maar omdat het onverkochte huis het
  netto vermogen domineert terwijl de legacy-gate op het **liquide** vermogen stuurt.
  Deze fix raakt zo'n geval daarom niet; de oplossing daar is een **expliciete UI-
  melding** ("je huis wordt nooit verkocht") plus de affordance naar de woonstrategie,
  en een meegroeiende (geïndexeerde) erfenis-doellijn. Dat is een UX-verduidelijking
  van correct rekengedrag, geen rekenwijziging.
