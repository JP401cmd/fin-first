# Core calc v5 — Structuur-dump

Bron: `core-calc-v5-snapshot.xlsm` (SHA256 `3E905809…BA80D`, zie identiteit.txt).
23 zichtbare sheets, maandbasis maand 0 t/m 1199 (leeftijd P!B7=36 → 100). Volledig formule-gedreven; VBA alleen `BepaalFIRE`, `RunScenarioBand`, `RunMonteCarlo` (Module1, zie vba.txt). 0 cached fout-cellen (#REF!/#VALUE! enz.) in het hele werkboek.
Rij-conventie maandtabellen: CF/Bel/Prognose/Ont/Werk-strategie/PT/**Af** starten data op **rij 2** (maand 0 = rij 2; Af empirisch geverifieerd tijdens de CF-port — stond hier eerder onterecht in de rij-4-groep); Bez/S/Controle/Verdeling op **rij 4**; Toename en afname op **rij 3**. Kolommen A/B/C = maand-index / leeftijd(jaar) / maand-in-jaar met `IF(P!$B$7+$A/12>100,"",…)` als horizon-guard — maar het guard-gedrag op réken-kolommen is tabel-specifiek (Bel leegt; Ont zet neutrale waarden; CF hybride B–G leeg/H–K nul; Werk-strategie N:S rekent door) en de kolom-thuisbasis verschilt per tab: verifieer beide altijd tegen de fixtures.

---

## P (100×20) — Invoer & aannames + solver-status
Blokken (label in A, waarde in B; D/E-kolom bevat keuzelijst-bronnen):
- **Persoon & spaargedrag** B5 geboortejaar, B6 startjaar, B7 `=B6-B5` leeftijd, B10 netto jaarinkomen, B11 netto jaaruitgaven, B12 `=B10-B11`, B13 spaarquote, B14 inflatie, B15 uitgave na pensioen/jaar, B16 **FIRE-leeftijd (invoer / Goal Seek)**.
- **Box 3** B18 heffingvrij vermogen p.p., B19 `=1+PT!$B$2` personen, B20 tarief 36%, B21/22/23 forfaits spaar/overig/schuld, B24 schuldendrempel p.p., B25 rente tekort-lening.
- **Strategieën** B28/29/30 toename/afname/onttrekking (mapping op TS).
- **FIRE-solver** B35 eindleeftijd `=IFS(ES!C5=…)` (per eindstrategie; pensioen/eeuwigdurend→100), B36 doel `=IFS(ES!C7="legacy",ES!C12*(1+B14)^(B35−B7); "perpetual",Prognose!J@FIRE*(1+B14)^(B35−B16); TRUE,0)`, B37 model `=INDEX(IF(AND(ES!C7="legacy",ES!C13="Ja"),Prognose!I,Prognose!J),(B35−B7)*12+1)`, B38 gap `=B37−B36`, B39 tekst "52 jr 2 mnd".
- **Scenarioband** B42 keuze, B43 `=SWITCH(B42,'Pessimistisch',−0.02,'Verwacht',0,'Optimistisch',0.02)`, B44 alleen investeringspotten (=1), B45 `=Rapport!L6`.
- **Eindstrategie** B48 keuze; parameters B51 eindleeftijd-opeten, B52 eindleeftijd-nalatenschap, B53 nalatenschapbedrag (koopkracht nu), B54 niet-liquide meetellen Ja/Nee, B55 AOW-leeftijd. ES spiegelt (ES!C10:C15).
- **Woning-strategie (D)** B57 modus {Meerekenen|Uitsluiten|Verkopen|Opeethypotheek}, B58 trigger {Vaste leeftijd|Wanneer nodig}, B59 verkoopleeftijd/fallback, B60 drempel (mnd uitgave), B61 verkoopprijs % WOZ, B62 verkoopkosten %, B63 huur % WOZ/jr, B64 startleeftijd opname, B65 max % overwaarde, B66 rente opeet, B67 maandopname (leeg=auto).
- **Onttrekkingsprofiel (F)** B69 {Vast|Afnemend|Oplopend|Guardrails}; fase-curve B71 t/m-leeftijd-1, B72 factor1 %, B73 t/m-leeftijd-2, B74 factor2 %, B75 factor3 %; guardrails B77 floor, B78 ceiling, B79 onderdrempel-ratio, B80 bovendrempel-ratio, B81 stap; B82 referentie `=IFERROR(INDEX(Prognose!J, ROUND((B16−B7)*12,0)),0)` (= liquide maand vóór FIRE, m−1-anker).
- **Box3-methode (E)** B90 {forfaitair|werkelijk}, B91 heffingvrij inkomen p.p., B92 `=B91*B19`. E89:E92 = perspectieflijst Rapport!F2 {ik|partner|samen}.
- **Solver-status (I)** B93 `=IF(AND(ES!C7="pensioen",B99>0),"pension_shortfall",IF(INDEX(Prognose!J,1)>=B36,"reached_now",IF(B38<0,"unreachable_within_horizon","reached_at")))`; B94 melding (SWITCH); B95 stale-detectie `gap > 5%·doel → "draai BepaalFIRE opnieuw"`; B96 extra-sparen-hint `−B38/((B35−B7)*12)` €/mnd; B98 `=B38`; B99 tekort-lening `=MAXIFS(S!AB,S!AR,"<="&B35)`; B100 laatste VBA-status.
- B3 TOTAALOORDEEL `=Controle!K1`.

## bens (23×9) — Invoer bezittingen & schulden
- **Bezittingen rij 4-13** (10 slots): A naam, B startwaarde, C rendement %, D Box3-type {Box 3 spaar|Box 3 investering|Geen Box 3}, E categorie {Spaargeld|Beleggingen|Pensioen|Vastgoed|Eigen huis|Overig}, F investering-vlag `=IF(OR(E="Beleggingen",E="Vastgoed"),1,0)` (handmatig overschrijfbaar; stuurt scenarioband/MC/Hist).
- **Schulden rij 17-23** (7 slots): A naam, B startwaarde, C aflossing %/jr, D aflossing €/jr, E rente %, F Box3-type, G liquide, H "in sparen na aflossing" (rente-vrijval CF!G), I categorie {Woning|Consumptief|Studie|Zakelijk|Overig|Tekort}. **Vaste slot-rollen:** rij 17 = hypotheek eigen woning, rij 20 = "Opeethypotheek (auto — P!B57)" (E20 `=P!$B$66`), rij 23 = Tekort-lening (E23 `=P!B25`). Bewaakt door Controle!K8/K9.

## TS (78×12) — Strategie, prioriteiten, niet-liquide
- Rij 5-10 bezitting-categorieën / rij 16-21 schuld-categorieën: B/C/D = prio Toename/Afname/Onttrekking (via INDEX op mapping-matrix o.b.v. gekozen strategie), E huidige waarde (SUMIF bens), G gevuld-vlag, **H niet-liquide?** — H9 (Eigen huis) en H16 (Woning-schuld) `=IF(P!$B$57="Meerekenen","Nee","Ja")`, rest handmatig.
- Mapping-matrices (prio per strategie, bewerkbaar): toename C32:G37 (+schulden C40:G44), afname C52:F57, onttrekking C65:F70. Gewichtskolommen H..L: `½^(prio−1)/totaal`, prio≥5→0, niet-liquide→0. Totaalgewichten C46:G46 / C58:F58 / C71:F71 (SUMPRODUCT).
- Prio-semantiek (A73:B78): prio 1-4 = gelijktijdig gewogen; prio 5 = reserve (alleen restant); prio ≥6 = nooit → tekort-lening. B22/A23 = prioriteiten-controle (huidige stand: **"FOUT: 2 gevulde categorie(ën) zonder prioriteit"** — Consumptief+Studie hebben geen toename-prio onder 'gelijk verdelen over bezittingen').

## ES (21×6) — Eindstrategie (spiegel van P)
C5 `=P!B48`; C6 uitleg; **C7 interne code** `=IFS(…"Vermogen opeten","deplete";"Nalatenschap","legacy";"Eeuwigdurend","perpetual";"Pensioenleeftijd","pensioen")`; C10:C15 parameters `=P!B51…B55` met actief-markering. C13 = P!B54 (niet-liquide meetellen) → gebruikt in P!B37 én MC!B8.

## Geb (37×31) — Gebeurtenissen (handmatig + auto)
- Rij 4-13 handmatig, per gebeurtenis 3 posten: B/I/P type {Eenmalig|Periodiek}, C/J/Q bedrag (+bate/−kost, koopkracht nu), E/L/S startleeftijd, F/M/T startmaand, G/N/U eindleeftijd, H/O/V eindmaand. Helpers W:AE = sIdx/eIdx/bedrag per post (maandindex; leeg→99999/99998).
- Rij 14 **AOW (auto)** uit Auto-geb!B21; rij 15-20 pensioen multi-pot uit Auto-geb rij 26-31; rij 21-26 kinderen (NIBUD-fasen/opvang/bijslag/babyuitzet, 2 rijen p. kind uit Auto-geb rij 35-52); rij 30 erfenis (Auto-geb!B59).
- Rij 32-37 resultaatblok werk-strategie (status, plafond-leeftijd, extra netto vóór FIRE, cumulatieve extra besparing) — informatief.
- Huidig gevuld: Huwelijk (40j6m: +5000/−15000), Pensionering (65: +20000 eenmalig, +1500/mnd 65-80, +100/mnd 65-…), AOW auto €1452/mnd 67-100.

## Auto-gebeurtenissen (65×14) — domeinkennis → Geb
Invoer B4-B18 (leefsituatie, AOW-opbouwjaren, kinderen+geboorteleeftijden, NIBUD-basis, opvang, bijslag, babyuitzet, erfenis bruto/relatie/leeftijd). AOW B21 `=IF(B4="Alleenstaand",1452,993)*MIN(B5,50)/50`. Pensioen-slots rij 26-31: modus pot → `PMT(inflatie/12, duur*12, −inleg)`, lijfrente_levenslang→eind 100, partner-uitk.%; "Geïndexeerd=Nee" → vooraf gede-indexeerd (motor indexeert centraal). Kinderen rij 35-52: fasen ×1,2/1,0/1,3, verstreken fasen geklemd op maand 0. Erfenis B56 vrijstelling / B57 vlaktarief per relatie (2025-benadering), B58 netto, B59 gede-indexeerd Geb-bedrag. Leest nooit vermogen (geen kringverwijzing).

## Werk-strategie (1201×19) — NIEUW in v5 (J)
Invoer: B1 basis netto/mnd `=P!$B$10/12`, B2 reële groei/jr, B3 groei-tot-leeftijd (leeg=doorlopend), B4 plafond (0=geen); sprongen D3:E8 (leeftijd, Δ reëel/mnd); deeltijd G3:H8 (vanaf leeftijd, pct — oplopend). Jaartabel K/L: reëel salaris per leeftijd (recursief, `MIN(plafond, (L_prev+sprongen)·(1+B2))`, t/m 71). Maandtabel N:S: P reëel salaris (jaar-lookup × deeltijd-LOOKUP), Q reële delta `=P−B1`, R nominale delta `=Q·(1+P!B14)^(m/12)`, **S delta gegate `=IF(leeftijd<IF(P!B16="",P!B35,P!B16),R,0)` → CF!D**. Controles B6 (uit-stand lekt niet) + Controle!K11.

## Prognose (1201×15) — samenvattend vermogen per maand
D totaal bezittingen `=INDEX(Bez!AH+AI+AJ, m+1)`; E totaal schulden `=INDEX(S!AF+AG, m+1)`; F Box3 `=INDEX(Bel!K, m+1)` (forfaitaire referentie; info); G cumulatief F; H bruto `=D−E`; **I netto `=H`** (belasting loopt via cashflow, niet cumulatief afgetrokken); **J netto-liquide `=I−(L−M)`**; K `=−E`; L niet-liquide bezittingen (TS!H5:H10-vlaggen × Bez!AM:AR-categorietotalen); M niet-liquide leningen (TS!H16:H20 × S!AJ:AN).

## CF (1201×11) — cashflow
D inkomen `=P!B10/12·(1+P!B14)^(m/12) + PT!K + IFERROR('Werk-strategie'!S,0)`; E uitgaven `=P!B11/12·idx + Bez!BA − Bez!BB` (huur na verkoop / vervallen hypotheeklast); F sparen `=IF(m≥FIRE-maand,0,D−E)`; G rente-vrijval: per schuld-slot (bens H="Ja" en S-saldo(m−1)=0) komt de geplande aflossing/12 vrij in sparen; H gebeurtenissen-baten `=ΣSUMPRODUCT(Geb W:AE, bedrag>0)·(1+P!B14)^(m/12)`; **I totaal extra geld `=F+G+H+Bez!AZ+Bez!BE − IF(m<FIRE-maand, K, 0)`** (verkoopopbrengst + opeet-opname erin; Box3 alleen vóór FIRE afgetrokken — ná FIRE zit Box3 in Ont!D); J gebeurtenissen netto `=H−Af!D−Ont!D`; **K Box3 (vorige mnd) `=IF(m=0,0,INDEX(Bel!N,m))`** = Bel!N(m−1).

## Bel (1201×16) — Box 3
Forfaitaire tak: D/E/F grondslagen (Bez!AH, Bez!AI, S!AF, m+1); G schuld na drempel `=MAX(0,F−P!B24·B19·(1+B14)^(m/12))`; H rendementsgrondslag `=D+E−G`; I fictief rendement/mnd `=D·B21/12+E·B22/12−G·B23/12`; J grondslag sparen&beleggen `=MAX(0,H−P!B18·B19·idx)`; K forfaitaire heffing `=MAX(0,B20·I·J/H)`. Heffingvrij vermogen én schuldendrempel zijn inflatie-geïndexeerd.
Werkelijke tak (E): L werkelijk rendement/mnd = Σ rendement-kolommen Bez met type "Box 3 spaar"/"Box 3 investering" − Σ rente S-slots met "Box 3 schuld" (**beide positief geformuleerd — symmetrisch**); M `=B20·MAX(0,L−P!B92/12)` (verliesmaand→0, geen verliesverrekening); **N canoniek `=IF(P!B90="werkelijk",M,K)`** → CF!K (m−1).

## Af (1203×7) — afname (negatieve gebeurtenissen)
D totaal afname = SUMPRODUCT over Geb-posten met bedrag<0, ×(1+P!B14)^(m/12).

## Ont (1203×10) — onttrekkingsbehoefte na FIRE (F)
**D `=IF(m≥FIRE-maand, MAX(0,(P!B15/12·(1+P!B14)^(m/12))·I + Bez!BA − Bez!BB + CF!K − PT!K), 0)`** — profielfactor alléén op de uitgave-term. F fase-factor (≤B71→B72%; ≤B73→B74%; anders B75%); G liquide m−1 `=INDEX(Prognose!J, m)`; H guardrails-factor: G/P!B82 >B80→`MIN(B78,1+B81)`, <B79→`MAX(B77,1−B81)`, anders 1; **I actieve factor `=SWITCH(P!B69,"Vast",1,"Afnemend",F,"Oplopend",F,"Guardrails",H,1)`**.

## Toename en afname (1202×91) — behoefte → categorie-bedragen
Per bezitting-categorie 9 kolommen (toename%/€, afname%/€, onttr.%/€, totaal €, aantal potten, per stuk €); per schuld-categorie 5 (toename% = aflos-share …). Rij 3 = statische %-gewichten uit TS (½^(prio−1) genormaliseerd). D totaal extra geld (CF!I), E afname (Af!D), F onttrekking (Ont!D).

## Verdeling (1203×219) — capaciteit-waterval (3 onderwerpen)
- **AFNAME**: D budget (Af!D); E:J caps = categorie-saldo m−1 (Bez!AM…AR, 0 als TS!H="Ja"); ~7 iteratieve passes (K…BH): per pass restbudget verdeeld naar gewicht over categorieën met restcapaciteit (`MIN(cap, vorige+rest·gewicht/Σactieve-gewichten)`); prio-5-reservepass BI:BO (alleen TS-prio=5, naar rato saldo); **eindtoewijzing BP:BU + BV onbenut/tekort**.
- **ONTTREKKING**: BX budget (Ont!D); BY:CD caps = restcapaciteit na afname; passes CE…EH; **EI:EN + EO onbenut**.
- **SCHULD-AFLOSSING**: EQ budget; ER:EV caps per schuld-categorie; passes EW…GS; **GT:GX + GY onbenut**; HC:HH = schuld-rest → bezitting-toename per categorie (overloop).
- BV+EO → tekort-lening (S!AB). HB `=Σ toename%`.

## Bez (1203×57) — bezittingen per maand
Per slot 3 kolommen (waarde/rendement/inleg), 10 slots D…AG. Waarde `=MAX(0, IF(m=0,bens!B, waarde(m−1)+rendement)+inleg)`; huis-slot J extra guard `IF($AY=1,0,…)`. **Rendement** per pot: `LET(basis=bens!C; hist=Hist-jaarreeks; eff = IF(bens!F=1, IF(Hist!B2=1∧hist beschikbaar, hist, basis+P!B43+IF(MC!B5=1, MC!B10+MC!kolom12-per-pot, 0)), basis); waarde(m−1)·eff/12)`. **Inleg** (LET): toename-per-stuk + extra-uit-aflossingsoverloop − (afname+onttrekking-categorie€)·share, met share = potsaldo(m−1)/categoriesaldo(m−1). Totalen AH:AJ (Box3-typen), AK/AL (rendement/inleg), AM:AR (categorieën).
**Woningblok AY:BE** ("lag-veilig: alle triggers lezen m−1; verkocht is monotoon"): AY verkocht(0/1) `=IF(OR(AY(m−1)=1, AND(B57="Verkopen", OR(vaste-leeftijd≥B59, AND("Wanneer nodig", leeftijd≥B16, Prognose!J(m−1) < B15/12·idx·B60), AND("Wanneer nodig", leeftijd≥B59)))),1,0)`; AZ verkoopopbrengst eenmalig `=J(m−1)·B61·(1−B62) − S!D(m−1)`; BA huur/mnd `=J(m−1)·B63/12` bij verkoop, daarna ×(1+B14)^(1/12); BB vervallen hypotheeklast/mnd (rente + evt. aflossing); BC overwaarde m−1 `=J(m−1)−S!D(m−1)`; BD cap opeet `=BC·B65` vanaf leeftijd B64; BE opname `=MIN(gewenst(P!B67 idx of auto cap/maanden), MAX(0, BD/(1+B66/12) − S!P(m−1)))`.

## S (1203×45) — schulden per maand
7 slots à 4 kolommen (saldo/aflossing/extra aflossen/rente): D:G hypotheek, H:K, L:O, **P:S opeethypotheek** (saldo `=IF(B57="Opeethypotheek", MIN(Bez!BD, (P(m−1)+Bez!BE)·(1+B66/12)), MAX(0,P(m−1)−Q−R))`; Q/R/S=0 in opeet-modus), T:W, X:AA, **AB:AE tekort-lening** (AB `=MAX(0, AB(m−1)+AE+(Verdeling!BV+Verdeling!EO)−AC−AD)`; AC aflossing uit waterval-toename; AE rente-bijschrijving `=AB(m−1)·bens!E23/12`; voorbij horizon bevroren). Slot-1-kolommen D/E/F dragen de **AY-guard** `IF(Bez!$AY=1,0,…)`. Extra-aflossen F/J/N/…: `Verdeling!GT:GX-categoriebedrag × saldo(m−1)/categorie-cap` (pot-share m−1). Totalen AF/AG (Box3/geen), AH/AI (aflossing/rente), AJ:AN (categorieën).

## Controle (1203×11) — reconciliatie
Per maand: C afname-waterval `|D−(ΣBP:BU+BV)|`; D onttrekking; E aflossing; F tekort↔onbenut `|(ΔS!AB−rente+afl)−(BV+EO)|`; G bezittingen-mutatie `|Δcategorietotalen−(rendement+inleg)|` met verkoop-correctie; H oordeel (tolerantie K7=€0,01). K1 totaaloordeel = "OK — alles sluit"; K2=0 foutmaanden; K4/K5/K6 max-afwijkingen ~1e-10. **Invarianten:** K8 huis op bens rij 6, K9 hypotheek op bens rij 17, K10 profiel 'Vast'→factor 1, K11 werk-strategie uit→delta 0.

## Rapport (96×18) — dashboard
R1 FIRE-maandrij; F2 perspectief {ik|partner|samen} (alleen weergaveblok B70:C75); B4/G4 solver-melding + stale-warning; KPI's (B6 FIRE-leeftijd, G6 netto nu, L6 `=INDEX(Prognose!I, R1)` netto op vrijheidsleeftijd, B9 piek, G9 tekort-piek, L9 totaal Box3); balans nu vs FIRE per categorie; ONZEKERHEID B62:I65 (Sim p/v/o, MC!B4, backtest); **CONTROLE WONING-STRATEGIE B77:D81** — assertion per modus (actief: "OK — verkoop op leeftijd 64", incl. check dat Prognose!I niet omhoog springt op de omslagmaand); WONING-GEBEURTENISSEN B84:G91 (afgeleide events + route); ONTTREKKINGSPROFIEL B93:C96 (gem. actieve factor na FIRE 0,875).

## MC (213×12) — Monte-Carlo
B1 N=10, B2 mu `=AVERAGEIFS(bens rendement, F=1)`, B3 sigma 0,15, B4 slaagkans `=AVERAGE(B14:B1013)`=0,535, B5 actief=0, **B8 slaagcriterium per eindstrategie** (deplete: J_eind≥0; legacy: (I of J o.b.v. ES!C13) ≥ doel geïndexeerd; perpetual: J_eind ≥ J_FIRE·(1+infl)^(B35−B16); pensioen: B16≥AOW), B10 gedeelde marktschok `=NORM.INV(sin-hash(B11),0,B3)`, **C12:L12 idiosyncratische ruis per pot (0,3·sigma, eigen sin-hash per slot)** — deterministisch. Rijen 14-213: 200 opgeslagen 1/0-uitkomsten.

## Hist (99×4) — backtest
B1 startjaar 1990, B2 actief=0, A4:A99 jaren 1928-2023, **B4:B99 rendementreeks = LEEG** (scaffolding zonder data; C2-check alleen actief bij B2=1).

## Sim (12×5) — scenarioband-uitkomsten
B1/B2/B3 live (FIRE, netto@FIRE, Prognose!J@eindleeftijd). B6:D8 = **vastgelegde uitkomsten scenariorun 2-7-2026** (blauw; per scenario maand-precieze FIRE via VBA): pessimistisch 58,17/1.242.122/344.223 · verwacht 55,58/1.200.446/769.364 · optimistisch 51,17/1.003.975/321.674. Instructies voor handmatige Data Table (kolominvoercel P!B43).

## PT (1201×11) — partner-parameterlaag (B)
B2 aanwezig(0/1)=0, B3 geboortejaar, B4 netto jaarinkomen, B5 AOW-leeftijd `=ES!C15`, B6 pensioen bruto/jr, B7 pensioen-startleeftijd, B8 geïndexeerd, B9 AOW-bedrag p.p./jr, B10 DOB-verschil, B11 partner-AOW-startmaand, **B12 partner-pensioen-startmaand** (head-tijdas; drempel voor de pensioen-term in J — tijdens de PT-port empirisch vastgesteld, ontbrak hier eerder). Maandkolommen G:K: I werkinkomen (tot partner-AOW), J AOW+pensioen (vanaf drempels), **K totaal → CF!D en Ont!D**. Controles D2:E4 (cashflow stroomt, P!B19-koppeling, FORMULATEXT-check op Bel!J2/G2 ×B19).

## Toelichting model (120×3) — zelf-documentatie
16 secties: opbouw/afbouw, invoer, 3 strategieën, prioriteiten, Box 3 (incl. werkelijk-methode + betaling via cashflow), eindstrategieën, tabbladen-overzicht, spelregels (iteratief UIT; alles via m−1-lag), partner, auto-gebeurtenissen, woning-strategie, onttrekkingsprofiel, werk-strategie, solver-status.
