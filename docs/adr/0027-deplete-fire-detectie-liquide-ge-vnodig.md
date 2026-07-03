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

---

## Addendum — 2026-06-24: fractionele FIRE-stip (`fireAgeFractional`)

`fireAge` is en blijft een integer (het detectiejaar). De grafische stip op de curve wordt
geplaatst via `fireAgeFractional`, dat met een nieuwe hulpfunctie `crossingAge()` wordt
geïnterpoleerd naar het sub-jaar-snijpunt van de getekende (nominale netto) curve met de
horizontale doel-lijn. De berekening is **geclamped binnen [fireAge − 1, fireAge]**, zodat
`|fireAgeFractional − fireAge| ≤ 1` altijd geldt.

Dit herintroduceert de vroege FIRE-leeftijd uit v1 (die dit ADR bewust verbiedt) **niet**:
de fractionele verschuiving is subintervallisch en verandert de integer detectie, de
`requiredFirePortfolioAtFire` en `liquideAtFire` niet. Het effect is uitsluitend visueel:
de stip komt op/vlakbij de horizontale doel-lijn te liggen in plaats van er meetbaar boven.
Van toepassing op de deplete/pensioen-tak; forced-fire, legacy en perpetual zijn ongewijzigd.

---

## Addendum — 2026-06-24: "Zuiver" — 0,6×-buffer verwijderd, blended reële voet (beslist openstaand productbesluit)

Het in §Gevolgen genoemde **openstaande productbesluit** ("het 0,6×-disconto … is bewust
**niet gewijzigd** … een apart ADR vereist") is met deze Fase-1-wijziging **beslecht**.

**Besluit:** `backwardVnodig` disconteert niet langer op `0,6 × gemiddeld reëel rendement`,
maar op de **werkelijke waarde-gewogen blended reële voet van de FIRE-eligible startpot**
(`blendedRealReturnStart` — exact de set die `liquidSumStart` optelt, incl. include_full-
woning op 100% met haar eigen return en losse bankrekening-cash @ 0%). Doel-lijn (V_nodig)
en drawdown delen daarmee **één grondslag**; de verborgen buffer en de grondslag-mismatch
zijn weg.

**Gevolgen:**

- **V_nodig daalt** over de hele lijn (hogere disconto-voet) → FIRE schuift ~1–3 jaar, het
  getoonde doelbedrag (`requiredFirePortfolio`) beweegt −0,7..−4,35% op de strategie-matrix.
  De goldens zijn herijkt; geen verkapte regressie (KERN-acceptatie groen).
- **Bodem-eerlijkheid** (criterium 7: onhoudbare uitgaven → `fireReachable=false`) komt nu
  van de expliciete premature-collapse-guard in `meetsStrategyTarget`, niet meer van de
  buffer die V_nodig kunstmatig verhoogde. Een onhoudbaar pad (bv. €500k/jr op een ~€100k-pot)
  haalt `liquide ≥ V_nodig` op géén enkele leeftijd → onbereikbaar.
- **Belangrijke nuance — geen intrinsieke samenval van de INTEGER-grootheden.** De grafische
  stip valt via `crossingAge`/`fireAgeFractional` op de doel-lijn, maar `liquideAtFire` (integer)
  kan tot **één discrete jaarstap** boven `requiredFirePortfolioAtFire` liggen: de stijgende
  opbouwcurve passeert de dalende V_nodig-lijn per jaar (jaarlijks grootboek). De eerdere
  formulering "FIRE-stip en doel-lijn vallen intrinsiek samen (binnen ~½ jaar opbouw)" gold
  voor de gebufferde V_nodig en is na Zuiver een overclaim voor de integer-grootheden; ze is
  in de engine-comments gecorrigeerd. Géén apart ADR nodig voor deze Fase-1-correctie
  (architect-oordeel): het beschermde gedrag — één voet voor doel-lijn én drawdown, getekende
  stip op de lijn — blijft intact en bewaakt door de "Grafiek lijn"-tests. (ADR 0028 dekt een
  ánder onderwerp: de downsize-"Verkopen"-herdefinitie, Fase 2.)

Bewaakt door `test/horizon-eindstrategie.test.ts` (#4 blended voet, #7 bodem-eerlijk) en de
herijkte invariant-tests in `test/horizon-engine.test.ts` (re-anchored op de werkelijke
discrete curve-/dekking-stap i.p.v. de achterhaalde spaar-proxy).

---

## Addendum — 2026-06-24: `inclusion_pct` ⟂ FIRE-behandeling (eigendoms-grondslag-correctie)

Het vorige addendum (en de oorspronkelijke Fase-1-implementatie) formuleerde de FIRE-eligible
engine-waarde van een **include_full-woning op 100%** — d.w.z. `net_worth_inclusion_pct` werd
voor het besteedbare huis genegeerd. **Dat was een fout** (firsthand gediagnosticeerd) en wordt
hierbij gecorrigeerd.

**Kern:** `net_worth_inclusion_pct` en `include_full` zijn **twee orthogonale assen**:

- **`net_worth_inclusion_pct` = EIGENDOM** — welk deel van het asset van de gebruiker is. Dit
  is een grootheid die **altijd** geldt, voor élk asset, in élke strategie — exact zoals het
  elders getoonde netto vermogen (`lib/dashboard-data-loader.ts`) inclusion_pct al toepast.
- **`include_full` = FIRE-BEHANDELING** — bepaalt uitsluitend dat het **eigen deel** (ná
  inclusion_pct) volledig als liquide/FIRE-eligible/besteedbaar telt, mét zijn eigen reële
  return. Het raakt de eigendoms-grondslag **niet**.

**Besluit:** `assetEngineValue` past inclusion_pct **altijd** toe; de eerdere `forceFull`-
override (inclusion → 100% voor het besteedbare huis) is verwijderd. De FIRE-eligible engine-
waarde van élk asset = `current_value × net_worth_inclusion_pct`. De `spendable`-vlag /
`isNonLiquid`-classificatie (= de FIRE-behandeling) blijft ongewijzigd: het eigen deel van een
include_full-huis blijft liquide/besteedbaar met zijn eigen reële return.

**Gevolg (echt account, huis €1.000.500 @ inclusion 50%, deplete, include_full):**

- Netto **start**-vermogen: van **boven €1M** → **€583.154** (huis €500.250 i.p.v. €1.000.500
  + cash/inv/crypto − schuld). Dit sluit nu byte-voor-byte aan op het elders getoonde netto
  vermogen — **geen desync meer** tussen het dashboard-netto-vermogen en de FIRE/afbouw-grondslag.
- Minder FIRE-eligible vermogen → FIRE schuift **52 → 59**; `requiredFirePortfolioAtFire`
  **€1.431.390 → €1.089.101**; `liquideAtFire` **€1.488.016 → €1.117.643**.

**Reikwijdte:** de strategie-matrix-persona (`lib/regression-tests/horizon-strategie/persona-fixture.ts`)
zet alle assets op inclusion_pct 100 → die goldens zijn **byte-identiek** vóór/na de fix
(geverifieerd, niet geregenereerd). Alleen de real-account-goldens (huis @ 50%) schoven.

Bewaakt door `test/horizon-eindstrategie.test.ts` (#5 huis-engine-waarde = current_value ×
inclusion_pct) en `test/horizon-engine.test.ts` (herijkte golden + netto-start-anker €583.154).

## Addendum (2026-07-03) — geërfd door de horizon-kernel

De v2-engine die dit besluit implementeerde is fysiek verwijderd (FASE 6 stap 5A, commit
`95bafeb53`). Het PRINCIPE — deplete/pensioen-FIRE via een crossing met de referentielijn,
niet via een aparte decumulatie-feasibility-test — ERFT structureel over: de horizon-kernel-
solver (`lib/horizon-kernel/solver.ts`, letterlijke port van de VBA-macro `BepaalFIRE`) bepaalt
de status via exact dit soort crossing-toets, nu op MAAND-precisie i.p.v. jaar-precisie:
`reached_now` wanneer `Prognose!J(0) ≥ B36` (het doelbedrag) direct al geldt, anders een
maand-bisectie naar de kleinste maand waar de gap (`B37 modelwaarde − B36 doelbedrag`)
niet-negatief wordt. Voor `pensioen` kort de kernel — net als v2 via `forcedFireAge` —
altijd sluit op de AOW-/pensioenleeftijd (geen bisectie). Zie de nieuwe concern
`horizon-kernel-bekende-afwijkingen` (`lib/architecture/archimate-concerns.ts`) voor een
bewust-gereproduceerde Excel-eigenaardigheid van dit statusblok bij een doelbedrag van €0.
Catalogus-entry: `horizon-kernel` in `lib/architecture/calculations.ts`.
