---
id: 0027-deplete-fire-detectie-liquide-ge-vnodig
title: 'Deplete/pensioen-FIRE-detectie: liquide ≥ V_nodig (crossing met de referentielijn)'
status: aanvaard
date: 2026-06-23
elements: [as-planning, fn-toekomstplannen]
---

# 0027 — Deplete/pensioen: FIRE-detectie via liquide ≥ V\_nodig

## Context

De v2-grootboek-engine (`lib/horizon-engine/engine.ts`) bepaalt het FIRE-moment via
`meetsStrategyTarget`. Voor de eindstrategie **deplete** (vermogen opeten) werd FIRE tot
dit besluit gedetecteerd via een **forward feasibility-test**: de annuïteit-spend-down moest
het volledige resterende liquide vermogen leeg kunnen onttrekken zonder dat de lijn
vroegtijdig (> 2 jaar voor de eindleeftijd) naar €0 liep.

Dit leverde een inconsistentie op: de FIRE-stip (`firePortfolioAtFire` = liquide op de
gevonden FIRE-leeftijd) zweefde systematisch **boven** de doel-lijn
(`requiredFirePortfolio` = V\_nodig op diezelfde leeftijd). Gemeten op het eigen account
(janpaul050486@gmail.com): ~€220k verschil, ~28% boven de doel-lijn. De oorzaak is
fundamenteel: de forward-spend-down meet een ander vermogen dan de backward-annuïteit die
V\_nodig uitrekent. Twee modellen leveren twee antwoorden; de stip en de lijn konden per
definitie niet samenvallen.

De backward-pass (`backwardVnodig`) rekent reeds op dezelfde grondslag als de
doel-lijn en de referentielijn (tabel E). V\_nodig is daarmee de intrinsiek consistente
maatstaf voor "heb ik genoeg?".

## Besluit

Voor **deplete** en **pensioen** wordt de FIRE-detectie in `meetsStrategyTarget`
gewijzigd naar:

> **liquide vermogen op de kandidaat-FIRE-leeftijd ≥ V\_nodig op diezelfde leeftijd**

Dit is feitelijk een **crossing** van de V\_op-lijn met de V\_nodig-referentielijn op het
FIRE-moment — de grootheid die de doel-lijn voedt is nu ook het detectiecriterium.
Daarmee vallen de FIRE-stip en de doel-lijn intrinsiek samen (binnen ~½ jaar
vermogensopbouw); het verschil tussen stip en lijn is per constructie ≤ één jaar
vermogensgroei, waar het voorheen ~28% bedroeg.

**Wat ongewijzigd blijft:**

- `backwardVnodig` en het 0,6×-disconto (`rOnttrek = 0.6 × reëel gemiddeld rendement`):
  de V\_nodig-waarden zelf wijzigen niet — alleen het detectiecriterium dat ze raadpleegt.
- **Perpetual en legacy** handhaven hun bestaande doel-zoektochten (`meetsStrategyTarget`
  perpetual-tak: eindvermogen ≥ start × 0,99 + niet leegloopt; legacy-tak: ADR 0017).
  Dit ADR raakt uitsluitend de deplete/pensioen-tak.
- INV-1 t/m INV-2 en INV-4 t/m INV-7 blijven ongewijzigd.

**Herziening van INV-3** (zie §5 van `docs/architecture/horizon-engine-v2.md`):

INV-3 luidde: "FIRE = forward doel-zoektocht (`meetsStrategyTarget`), **geen crossing**."
De motivatie was om de v1-crossing-FIRE (op een afwijkende decumulatie-aanname) niet terug
te brengen. Die motivatie geldt onverminderd voor perpetual/legacy. Voor **deplete/pensioen**
is de crossing echter geen afwijkende aanname maar de directe toets op V\_nodig, dezelfde
grootheid als de referentielijn. De herziening luidt:

> INV-3 (herzien, ADR 0027): FIRE = forward doel-zoektocht voor **perpetual/legacy**;
> voor **deplete/pensioen** = liquide ≥ V\_nodig (crossing met de referentielijn, ADR 0027).
> De forward-spend-down-feasibility mag voor deplete/pensioen **niet** worden
> geherintroduceerd (was het bug, niet de invariant).

## Gevolgen

- **FIRE-leeftijd verschuift voor deplete-accounts.** De richting hangt af van de
  accountcompositie: voor een scalar-portefeuille zonder eigen huis valt FIRE eerder
  (stip was te hoog → drempel daalt); voor een account met een groot niet-liquide eigen
  huis onder `on_depletion`-downsize kan FIRE later vallen (de combinatie was net genoeg
  voor de forward-test maar V\_nodig ligt tijdelijk hoger). Beide uitkomsten zijn correct
  en legitiem.
- **Golden-waarden van de strategie-matrix bijgewerkt.** De regressietests
  (`test/horizon-engine.test.ts`) zijn bijgewerkt na de fix; de new baseline is de
  nu-correcte uitkomst. De "deplete (ADR 0027): de FIRE-stip valt op de doel-lijn"-test
  bewaakt het nieuwe gedrag.
- **Downstream consumenten van `fireAge`** (horizon-hero, vrijheidsvoortgang-widget,
  vrijheidsmijlpalen, snapshot-route) bewegen mee met de gewijzigde FIRE-leeftijd.
  `requiredFirePortfolio` zelf verandert niet (V\_nodig op de gevonden leeftijd was al de
  grondslag; nu ook de detector).
- **Openstaand productbesluit:** het 0,6×-disconto op de onttrekkingsvoet (conservatief
  voor sequence-of-returns-risico versus een zuiver reëel 25×-equivalent) is bewust
  **niet gewijzigd**. Dit factor beweegt de FIRE-uitkomst nog ~10–15% t.o.v. een
  discountoloze V\_nodig. Wanneer de beoogde conservatisme-instelling heroverwogen wordt,
  is een apart ADR vereist.

Bewaakt door `test/horizon-engine.test.ts` ("deplete (ADR 0027): de FIRE-stip valt op de
doel-lijn").
