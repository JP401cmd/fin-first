---
id: 0023-jaarruimte-wtp-30pct-correctie
title: Jaarruimte-rekenmotor gecorrigeerd — 30% opbouw (WTP) + factor A × 6,27
status: aanvaard
date: 2026-06-17
elements: [as-belasting]
---

De jaarruimte-rekenmotor (`lib/jaarruimte.ts`, art. 3.127 Wet IB 2001) rekende fiscaal onjuist: een
verouderd opbouwpercentage van 13,3% (verkeerd benoemd als `JAARRUIMTE_FACTOR_A`), mislabelde
2025-constanten en een rauwe euro-aftrek voor werkgeverspensioen. Dit besluit legt de correctie vast:
**opbouwpercentage 30%** (verhoogd door de Wet toekomst pensioenen per 2023), een **grondslag-cap** op
het maximale premie-inkomen, en de werkgeverspensioen-correctie als **6,27 × factor A** in plaats van
een rauwe euro-aftrek.

## Context

De formule voor de jaarruimte (de fiscale aftrekruimte voor lijfrente/pensioen in box 1) is sinds de
Wet toekomst pensioenen (WTP, per 2023):

> jaarruimte = 30% × premiegrondslag − 6,27 × factor A − FOR-dotatie

met premiegrondslag = max(0, bruto jaarinkomen − AOW-franchise), afgetopt op (maximaal premie-inkomen
− franchise). De FOR is per 2023 afgeschaft; er zijn geen nieuwe dotaties, dus die term vervalt.

De bestaande motor had drie fiscale fouten:

1. **Opbouwpercentage 13,3% i.p.v. 30%.** De constante `JAARRUIMTE_FACTOR_A = 0.133` was zowel
   verouderd (de WTP *verhóógde* het opbouwpercentage van ~13,3% naar 30% — de code-comment had de
   geschiedenis omgekeerd) als verkeerd benoemd: 0,133 was het oude *opbouwpercentage*, niet *factor A*
   (dat is de jaarlijkse pensioenaangroei in euro's uit het UPO). Gevolg: de jaarruimte werd ruwweg
   2,25× te laag geschat, wat foutief belastingbesparingsadvies opleverde (ook in de AI-context van Will).

2. **Mislabelde 2025-constanten.** `JAARRUIMTE_FRANCHISE_2025 = 17.545` was in werkelijkheid de
   2024-franchise; `JAARRUIMTE_MAX_2025 = 34.310` klopte niet. De interne inconsistentie bevestigde de
   fout: `JAARRUIMTE_MAX_2026 = 35.589` klopt alléén bij 30% (30% × (137.800 − 19.172) = 35.588,4),
   niet bij 13,3% — de cap was daardoor betekenisloos geworden.

3. **Rauwe euro-aftrek voor werkgeverspensioen.** De motor trok `pensioenAangroei` rauw in euro's af,
   terwijl de wet **6,27 × factor A** voorschrijft (6,27 is de wettelijke imputatiefactor die de
   jaarlijkse pensioenaangroei omrekent naar een premie-equivalent).

Daarnaast bestond in `components/future/strategie/pensioen-strategie-editor.tsx` een lokale
duplicaat-implementatie (`schatJaarruimte`) met nóg afwijkende, verouderde constanten (franchise 17.545,
13,3%, max 34.950) — een tweede bron van waarheid die los van de engine dreef.

## Besluit

1. **Opbouwpercentage 30%.** `JAARRUIMTE_FACTOR_A = 0.133` is hernoemd naar
   `JAARRUIMTE_OPBOUW_PCT = 0.30` (de betekenis is het opbouwpercentage). De oude naam blijft als
   `@deprecated` alias bestaan die naar 0,30 wijst, zodat verborgen imports niet stilletjes breken.

2. **Gecorrigeerde jaar-constanten** (bron: Belastingdienst / Evi van Lanschot, juni 2026):
   - AOW-franchise: **2025 €18.475** (was foutief €17.545), **2026 €19.172** (ongewijzigd, correct).
   - Maximaal premie-inkomen: **€137.800** (2024/2025/2026, ongewijzigd) — nieuwe named constante
     `JAARRUIMTE_MAX_PREMIE_INKOMEN`.
   - Max jaarruimte (afgeleide verificatie): **2025 €35.798** (was foutief €34.310), **2026 €35.589**.

3. **Grondslag-cap (niet uitkomst-cap).** De premiegrondslag wordt afgetopt op
   `JAARRUIMTE_MAX_PREMIE_INKOMEN − franchise` *vóór* de factor-A-aftrek. Dit is fiscaal zuiverder dan
   het eindresultaat op `MAX_JAARRUIMTE` knijpen: de jaargebonden `MAX_JAARRUIMTE` ís per definitie
   30% × (137.800 − franchise), dus een uitkomst-cap zou dat magische getal dupliceren én bij een
   factor-A-aftrek het verkeerde plafond geven (de aftrek hoort ná de cap te komen). `MAX_JAARRUIMTE`
   is daarmee een afgeleide verificatie-constante geworden, geen tweede bron van waarheid.

4. **Factor A × 6,27.** De tweede parameter van `computeJaarruimte` heet voortaan `factorA` (de
   jaarlijkse pensioenaangroei in € uit het UPO); de motor doet intern × 6,27 via de named constante
   `JAARRUIMTE_FACTOR_A_IMPUTATIE = 6.27`. Het resultaat wordt op ≥ 0 geclampd. Het returnveld
   `JaarruimteResult.pensioenAangroei` is mee hernoemd naar `factorA`.

5. **Salaris-gebaseerde schatter.** Nieuwe pure helper `estimateFactorAFromSalary(grossYearlySalary,
   opts?)` schat factor A voor wie het UPO-getal niet kent, via de middelloon-route
   factor A = opbouw% × (pensioengevend salaris − franchise), met als default het fiscale
   middelloon-maximum 1,875%/jaar (art. 18a Wet LB). Nadrukkelijk gemarkeerd als **indicatie**.

6. **Eén bron van waarheid.** De lokale duplicaat `schatJaarruimte` in de pensioen-strategie-editor is
   verwijderd en vervangen door de canonieke `computeJaarruimte(grossYearlyIncome, 0)`. De
   Berekeningen-catalogus (`lib/architecture/calculations.ts`, entry `box1`) is bijgewerkt: `files`
   bevat nu `lib/jaarruimte.ts` (ontbrak) en `functions` `estimateFactorAFromSalary`.

## Gevolgen

- De jaarruimte (en het bijbehorende belastingbesparingssignaal op de Box 1-kaart, in de
  aandachtspunten en in de AI-fiscale-context) is voortaan fiscaal correct: ~2,25× hoger dan vóór de
  fix bij gelijk inkomen.
- Bestaande rekenende callers geven `factorA = 0` door (zzp/geen werkgeverspensioen-data); hun gedrag
  verandert uitsluitend door de rate-correctie 13,3% → 30%, niet door een plotse factor-A-aftrek. De
  echte factor A komt in een latere golf via persistentie binnen (de kolommen `profiles.pension_factor_a`
  / `_source` bestaan al, maar zijn in deze golf bewust nog niet bedraad — geen UI/DB-wiring).
- De grondslag-cap levert bij zeer hoog inkomen 2026 een uitkomst van €35.588, één euro onder de
  gepubliceerde €35.589 door afronding van de franchise-afgeleide; dit is inherent en gedocumenteerd
  in de motor-JSDoc en in de tests. **Bevestigd als by-design** (UAT-bevinding WF-BELAST-10,
  cosmetisch, juli 2026): het €1-verschil tussen de gauge (de exact berekende, op de euro afgeronde
  ruimte) en de voetregel (de gepubliceerde referentie `JAARRUIMTE_MAX_2026`) blijft bewust staan —
  de rekenmotor en de constante wijzigen niet. Wel is aan beide voetregels
  (`components/overview/jaarruimte-card.tsx` en `box1/page.tsx#JaarruimteUitleg`) een korte
  toelichting toegevoegd ("de gepubliceerde referentiewaarde; je exact berekende ruimte kan er door
  afronding een euro onder liggen") zodat het verschil als afronding leest en niet als fout.


## Addendum golf 2 — factor A-persistentie (juni 2026)

Status: Aanvaard.

De kolommen `profiles.pension_factor_a` (numeric, nullable) en `profiles.pension_factor_a_source`
('upo' | 'estimated' | null) zijn bedraad via migratie `20260617100000_...` (reeds op prod). De
canonieke resolver `resolvePensionFactorA(profile)` — in `lib/jaarruimte.ts` — levert
`{ factorA, source, isKnown }` aan alle consumenten:

- `NULL` betekent `isKnown: false`, `factorA: 0` ("niet ingevuld"); de jaarruimte-motor rekent
  conservatief met 0 en de tips-demper onderdrukt het jaarruimte-aandachtspunt zolang
  `!pensioenFactorAKnown && bedrijfspensioen-event`.
- Expliciete `0` betekent `isKnown: true` (zzp/geen werkgeverspensioen — wel ingevuld, toevallig nul).
- Waarde `> 0` betekent `isKnown: true`; wordt intern x 6,27 afgetrokken.

De resolver schat **niet** automatisch uit salaris — dat is een expliciete gebruikersactie
(`_source: 'estimated'`) via de pensioen-strategie-editor (deeplink `box1#jaarruimte-uitleg`).
Het schrijfpad loopt via `saveFactorA` in de editor en `PUT /api/parameters`; de loader
(`lib/horizon-data-loader.ts`) exposeert `pensioenFactorA` en `pensioenFactorAKnown` op de bundel.

Consumenten lezen via de resolver of de bundel: `box1/page.tsx` (eigen kaarten; partner-kaart
blijft bewust op factor A = 0 — privacy, geen huishoud-deling), `lib/ai/context/tax-context.ts`,
`lib/aandachtspunten-loader.ts`, de strategie-editor en de jaarruimte-card.

Scope: `profiles.pension_factor_a` is de eigen factor A van de ingelogde gebruiker.
Huishoudleden delen deze waarde niet.

## Bronnen

- Belastingdienst — art. 3.127 Wet IB 2001; Kennisgroepen-publicatie KG:070:2024:3 (jaarruimteberekening).
- Art. 18a Wet LB (1,875% middelloon-opbouwmaximum), Belastingdienst "factor A".
- Evi van Lanschot, "Jaarruimte 2026 berekenen" (juni 2026): franchise €19.172, max jaarruimte €35.589,
  opbouwpercentage 30%, max premie-inkomen €137.800.
