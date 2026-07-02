# Core calc v5 — Rekenvolgorde & principes

## 1. Dataflow tabel→tabel (wie leest wie)

```
P (invoer) ──────────────┬─→ vrijwel alles
bens (potten) ───────────┼─→ Bez, S, CF, TS, MC
TS (prio/niet-liquide) ──┼─→ Toename en afname (gewichten), Verdeling (prio-5), Prognose (L/M-vlaggen)
ES (spiegel P) ──────────┼─→ P!B35/36/37, MC!B8, PT!B5, Auto-gebeurtenissen
Auto-gebeurtenissen ─────┼─→ Geb (rij 14-30)
Werk-strategie ──────────┼─→ CF!D (delta), Geb rij 32-37 (info), Controle!K11
PT ──────────────────────┼─→ CF!D, Ont!D, P!B19
Geb ─────────────────────┼─→ CF!H (baten), Af!D (kosten)
Bel ─────────────────────┼─→ CF!K (N, m−1)
CF ──────────────────────┼─→ Toename en afname (D = totaal extra geld), Ont!D (K-term), PT (tijdas)
Af ──────────────────────┼─→ Verdeling (afname-budget), Toename en afname, CF!J
Ont ─────────────────────┼─→ Verdeling (onttrekking-budget), Toename en afname, CF!J, Controle
Toename en afname ───────┼─→ Verdeling (gewichten rij 3 + €/categorie), Bez (inleg), S (tekort-aflossing)
Verdeling ───────────────┼─→ Bez!F-inleg (extra), S (extra aflossen, tekort-lening BV/EO), Controle
Bez ─────────────────────┼─→ Prognose (D/L), Bel (grondslagen + werkelijk rendement), CF (BA/BB/AZ/BE), S (AY-guard, opeet-cap), Ont (BA/BB), Verdeling (caps m−1)
S ───────────────────────┼─→ Prognose (E/M), Bel (schuld-grondslag + rente), CF!G (payoff-check m−1), Bez (BC overwaarde m−1)
Prognose ────────────────┼─→ P (B36/37/82, solver-gap), Ont!G (J, m−1), Bez!AY (verkoop-trigger, m−1), MC!B8, Sim, Rapport
Hist / MC ───────────────┼─→ Bez (rendement-override / schokken)
Controle ────────────────┴─→ P!B3 (totaaloordeel)
Rapport / Sim → alleen presentatie (Sim!B6:D8 door VBA beschreven)
```

Kringverwijzing wordt vermeden door consequent **m−1-verwijzingen** (zie §2); iteratieve berekening staat bewust UIT (Toelichting model §10 "Spelregels").

## 2. De één-maand-lag — exacte plekken

| Plek | Formule (representatief) | Betekenis |
|---|---|---|
| CF!K2 | `=IF($A2=0,0,INDEX(Bel!$N$2:$N$1201,$A2))` | belasting(m) = canonieke heffing Bel!N(m−1); maand 0 → 0 |
| Ont!D | `…+CF!K…` | post-FIRE Box3 in de onttrekkingsbehoefte, dus ook m−1 |
| Ont!G3 | `=IF($A3=0,0,IFERROR(INDEX(Prognose!$J$2:$J$1201,$A3),0))` | guardrails lezen liquide vermogen m−1 |
| P!B82 | `=INDEX(Prognose!$J…, ROUND((B16−B7)*12,0))` | guardrails-referentie = J in de maand vóór FIRE (m−1-anker) |
| Bez!AY5 | trigger op `INDEX(Prognose!$J…, $A5)` = J(m−1) | verkoop-trigger "Wanneer nodig" leest liquide m−1; AY zelf is monotoon |
| Bez!AZ/BA/BB/BC | `J4`, `S!D4` bij rij 5 | verkoopopbrengst/huur/vervallen last/overwaarde uit stand m−1 |
| Bez!F (inleg) | `_xlpm.aprior = INDEX(Bez!$D…, MATCH($A−1,…))` | pot-share bij afname/onttrekking = potsaldo(m−1)/categoriesaldo(m−1) |
| S!F/J/N/… (extra aflossen) | `INDEX(S!$D…, MATCH($A−1,…))` | schuld-share idem, saldo m−1 |
| CF!G | `INDEX(S!$D…, MATCH($A2−1,…))=0` | rente-vrijval pas in de maand ná payoff |
| Verdeling!E:J (caps) | `INDEX(Bez!$AM…, MATCH($A4−1,…))` | waterval-capaciteit = categoriesaldo m−1 |
| S!AB (tekort) | `AB(m−1) + rente + (BV+EO)(m) − aflossing(m)` | tekort-lening groeit uit onbenut budget van maand m zelf; rente over saldo m−1 |

De verkoopopbrengst (Bez!AZ) landt via CF!I **in dezelfde maand** in de waterval; de lag zit in de trigger (AY leest m−1), zoals gedocumenteerd op P!A68 en Bez!AY2.

## 3. Nominaal vs. reëel
Het maandmodel rekent **nominaal**; er wordt nergens gedefleerd. Reële invoer wordt vooraf geïndexeerd:
- Inkomen/uitgaven/sparen: `P!B10/12·(1+P!B14)^(m/12)` (CF!D/E), uitgave na pensioen idem in Ont!D.
- Gebeurtenissen: bedragen in koopkracht-nu; CF!H en Af!D vermenigvuldigen met `(1+P!B14)^(m/12)`. Niet-geïndexeerde auto-posten (pensioen "Geïndexeerd=Nee", erfenis) worden **vooraf gede-indexeerd** zodat de centrale indexatie ze weer nominaal-constant maakt.
- Doelen: legacy-doel `ES!C12·(1+B14)^(B35−B7)` (koopkracht-nu → nominaal op eindleeftijd); perpetual-doel = J@FIRE·(1+B14)^(B35−B16) (reëel kapitaalbehoud).
- Fiscaal: heffingvrij vermogen én schuldendrempel geïndexeerd met (1+B14)^(m/12) (Bel!G/J).
- Werk-strategie: jaarladder is reëel (groei bóven inflatie), kolom R maakt het nominaal.
- Rendementen zijn nominale jaarpercentages, maandelijks toegepast als r/12 (enkelvoudig per maand, geen ^(1/12)); uitzondering huur-indexatie `(1+B14)^(1/12)` (Bez!BA).

## 4. Onttrekkingsbehoefte (kolom, profiel-mechanisme)
`Ont!D(m) = 0` vóór FIRE-maand; daarna
`MAX(0, (P!B15/12)·(1+P!B14)^(m/12) · Ont!I(m) + Bez!BA(m) − Bez!BB(m) + CF!K(m) − PT!K(m))`.
- **Ont!I** = actieve factor: `SWITCH(P!B69: Vast→1; Afnemend/Oplopend→F; Guardrails→H)`.
- **Ont!F** (fase): leeftijd ≤ B71 → B72%; ≤ B73 → B74%; anders B75%.
- **Ont!H** (guardrails, toestandloos per maand): ratio = J(m−1)/P!B82; > B80 → `MIN(B78, 1+B81)`; < B79 → `MAX(B77, 1−B81)`; anders 1.
- De factor werkt **alleen** op de uitgave-term; huur, vervallen hypotheeklast, Box3 en partnerbijdrage vallen erbuiten (Ont!J1). Partner-overschot boven de behoefte valt weg door de MAX(0;…).

## 5. Waterval (Verdeling) — kolom voor kolom
Drie onderwerpen na elkaar in één rij (maand): **afname** (gebeurtenis-kosten) → **onttrekking** (pensioenuitgaven) → **schuld-aflossing** (toename-kant), plus de toename-verdeling zelf via 'Toename en afname'.
1. Budget: D = Af!D; BX = Ont!D; EQ = aflos-deel van CF!I.
2. Caps: E:J = categoriesaldo m−1 (0 indien TS!H="Ja"); onttrekking-caps BY:CD = cap − afname-toewijzing; aflossing-caps ER:EV = schuldsaldi.
3. **Passes** (~7 per onderwerp, kolomblokken K…BH / CE…EH / EW…GS): per pass (a) restbudget = budget − toegewezen, (b) som gewichten van categorieën met restcapaciteit (gewicht per categorie uit 'Toename en afname' rij 3 = TS-½^(prio−1) genormaliseerd), (c) nieuwe toewijzing = `MIN(cap, vorige + rest·gewicht/som)`. Herverdeling: valt een pot tegen zijn cap, dan pakken volgende passes de rest bij de overige categorieën.
4. **Prio-5-reservepass** (BI:BO bij afname): het na pass 7 resterende budget gaat naar categorieën met TS-prio 5, naar rato saldo.
5. **Eindtoewijzing** BP:BU / EI:EN / GT:GX; **Onbenut** BV / EO / GY. HC:HH = niet-plaatsbaar aflos-budget terug naar bezitting-toename.
6. Pot-niveau: Bez!F-inleg en S!F-extra-aflossen splitsen het categorie-bedrag naar potten via share = saldo(m−1)/categoriesaldo(m−1).

## 6. Tekort-lening (S!AB:AE)
Ontstaat uit **onbenut budget**: `AB(m) = MAX(0, AB(m−1) + AE(m) + Verdeling!BV(m) + Verdeling!EO(m) − AC(m) − AD(m))` — afname/onttrekking die de potten niet konden leveren wordt geleend. AE = rente-bijschrijving `AB(m−1)·bens!E23/12` (accrual in het saldo, geen cashflow). AC = aflossing uit de toename-waterval ('Toename en afname' schuld-kolommen; prio 1 via TS rij 21). Box 3-schuld (grondslag-verlagend). Voorbij leeftijd 100 bevroren. Controle!F bewaakt de identiteit Δtekort ↔ onbenut.

## 7. Prognose netto-liquide (J)
`I = H = D − E` (netto = bruto; Box3 loopt via cashflow, niet cumulatief van vermogen af — Prognose!F/G zijn info). `J = I − (L − M)` met L = som van Bez-categorietotalen (AM:AR) waarvan TS!H5:H10="Ja", M = som van S-categorietotalen (AJ:AN) waarvan TS!H16:H20="Ja". Onder woning-strategie ≠ "Meerekenen" staan TS!H9/H16 op "Ja" → huis én woningschuld buiten J. FIRE-grondslag = J; nalatenschap-meetlat = I of J afhankelijk van ES!C13.

## 8. Solver (VBA `BepaalFIRE`) en zijn gap
- Gap-cel **P!B38 = P!B37 − P!B36** (model − doel op eindleeftijd B35).
- Algoritme: eindstrategie "pensioen" → B16 := AOW (ES!C15), klaar. Anders **verse bisectie over de volledige range**: B16 := horizon (100); als B38 < 0 → unreachable (B16 blijft op horizon, status + €/mnd-hint). Anders bisectie lo=0, hi=(100−leeftijd)·12 op `B38 ≥ 0` → kleinste maand met gap ≥ 0; statuscellen (B93/B94) pas ná de bisectie gelezen; B100 := status; MsgBox met melding.
- `RunScenarioBand`: zelfde bisectie per scenario (B42), schrijft Sim!B6:D8 (#N/A indien onhaalbaar), herstelt daarna B42:="Verwacht" en **B16 := Sim!B7**.
- `RunMonteCarlo`: N = MC!B1; B5:=1; loop runteller B11 = 1..N, herberekent, schrijft MC!B8 (1/0) naar rij 13+i; B5:=0. Randomness deterministisch in werkbladformules (sin-hash → NORM.INV): gedeelde marktschok per run (MC!B10) + idiosyncratische ruis per pot (MC!C12:L12, 0,3σ).
