# Core calc v5 — Verificaties

## a) F — onttrekkingsprofiel: AANWEZIG ✅
- Parameters: P!B69 (keuzelijst Vast/Afnemend/Oplopend/Guardrails, bron D70:D73), fase-curve P!B71:B75, guardrails P!B77:B81, referentie P!B82 (`=IFERROR(INDEX(Prognose!$J$2:$J$1201,ROUND((P!$B$16-P!$B$7)*12,0)),0)` — maand vóór FIRE). Huidig: "Afnemend", curve 100/85/70 t/m 75/85.
- Grijppunt: **Ont!I** (`=SWITCH(P!$B$69,"Vast",1,"Afnemend",F,"Oplopend",F,"Guardrails",H,1)`) vermenigvuldigt uitsluitend de uitgave-term in **Ont!D**: `(P!B15/12·(1+P!B14)^(m/12))·$I + Bez!BA − Bez!BB + CF!K − PT!K`. Ont!F = fase-factor, Ont!H = guardrails-factor op J(m−1)/P!B82, Ont!G = liquide m−1.
- Bewaakt: Controle!K10 (profiel 'Vast' → factor overal 1) en Rapport!B93:C96 (gem. actieve factor na FIRE = 0,8748).
- Kanttekening (gedocumenteerd op P!C69): Guardrails is toestandloos per maand (±1 stap rond 1, geen ratchet) en doet deterministisch ≈ niets; alleen zinvol met scenarioband/MC/Hist.

## b) I — solver-statussen: AANWEZIG ✅
- P!B93: `=IF(AND(ES!$C$7="pensioen",$B$99>0),"pension_shortfall",IF(INDEX(Prognose!$J$2:$J$1201,1)>=$B$36,"reached_now",IF($B$38<0,"unreachable_within_horizon","reached_at")))` → nu "reached_at". Alle vier verwachte statussen aanwezig.
- P!B94 melding (SWITCH per status), P!B96 **€/mnd-hint** bij unreachable: `−B38/((B35−B7)·12)` "…extra sparen maakt het net wél haalbaar (excl. rendement-op-rendement)". P!B98 gap, P!B99 tekort-lening t/m eindleeftijd (`MAXIFS(S!AB;S!AR≤B35)`), P!B100 laatste VBA-status ("reached_at"). Rapport!B4/G4 spiegelen melding + stale-warning; VBA toont B94 als MsgBox.

## c) J — werk-strategie: AANWEZIG ✅
- Eigen tab 'Werk-strategie' (1201×19): reële groei B2 (2%), groei-tot B3, plafond B4, sprongen D3:E8, deeltijd G3:H8; jaarladder K/L (t/m 71); maandkolommen P (reëel salaris) → Q (reële delta) → R (nominale delta) → **S (gegate: `=IF($O<IF(P!$B$16="",P!$B$35,P!$B$16),$R,0)`)**.
- Landing in CF: CF!D `= P!$B$10/12·idx + PT!$K + IFERROR('Werk-strategie'!S,0)` — alleen de delta, geen dubbeltelling; stopt bij FIRE (geen salarislek in onttrekkingsfase). Controles: tab-eigen B6 + Controle!K11 (uit-stand lekt niet); resultaatblok op Geb rij 32-37.

## d) AY-guard in S!E/F: AANWEZIG ✅ (slot 1)
- S!E5: `=IF(Bez!$AY5=1,0,IF($B5="","",IF($A5=0,0,MIN(D4,IF(bens!$D$17>0,bens!$D$17,bens!$C$17*bens!$B$17)/12))))`
- S!F5: `=IF(Bez!$AY5=1,0,IFERROR(INDEX(Verdeling!$GT$4:$GX$1203,…)*IFERROR(INDEX(S!$D$4:$D$1203,MATCH($A5-1,…)),0)/INDEX(Verdeling!$ER$4:$EV$1203,…),0))`
- S!D5 zet het saldo zelf op 0: `…IF(Bez!$AY5=1,0,MAX(0,D4-E5-F5))…`. Consistent aanwezig in alle datarijen (gecheckt rij 5, 6, 100, 600). Geen dubbele aflossing in de verkoopmaand meer; guard geldt alléén voor slot 1 — dat is nu een bewaakt contract (zie f2/Controle!K9). Rapport!D80 assert bovendien dat Prognose!I op de omslagmaand niet omhoog springt → cached "OK — verkoop op leeftijd 64".

## e) Box3-gate symmetrisch: JA ✅
Bel!L (werkelijk rendement) gebruikt **positieve gates aan beide kanten**: bezittingen `IF(OR(Bez!$D$2="Box 3 spaar",Bez!$D$2="Box 3 investering"),…)` en schulden `IF(S!$D$2="Box 3 schuld",…)` (rente afgetrokken). Lege/typeloze potten tellen niet mee (toelichting Bel!P4 benoemt dit expliciet). Canonieke keuze via Bel!N + P!B90; CF!K leest N met m−1 — lag-constructie identiek voor beide methoden.

## f) Solver vers? → **FLAG: STALE/INCONSISTENT** ⚠️
Cached stand: P!B16 = 52,1667 (52 jr 2 mnd); P!B37 = 314.621,79; P!B36 = 291.346,14; **P!B38 (gap) = +23.275,65**; P!B100 = "reached_at". De eigen stale-detector **P!B95 staat aan**: "⚠ Gap is groot (€ 23.276) — FIRE kan eerder; draai BepaalFIRE opnieuw" (drempel 5% van doel = €14.567). Twee lezingen:
1. De gap kán een maand-granulariteit-artefact zijn: één maand extra sparen (~€5k op FIRE-moment) groeit in 38 jaar tot ~€25k op eindleeftijd, dus +23k is verenigbaar met een correcte "kleinste maand met gap ≥ 0".
2. Maar **Sim!B7 (scenario "Verwacht", vastgelegd 2-7-2026, zelfde dag als LastWriteTime) = 55,583** — onder identieke instellingen zou de bisectie hetzelfde antwoord moeten geven als BepaalFIRE. 52,167 ≠ 55,583 ⇒ minstens één van beide is met andere inputs bepaald. De cached toestand is dus **intern inconsistent**; vóór oracle-gebruik eerst BepaalFIRE (en RunScenarioBand) opnieuw draaien.
Overig relevant: TS!A23 meldt "FOUT: 2 gevulde categorie(ën) zonder prioriteit" (Consumptief/Studie zonder toename-prio onder de huidige strategie — configuratie-waarschuwing, geen rekenfout); Controle!K1 = "OK — alles sluit" (0 foutmaanden, max afwijking ~1e-10).

## g) VBA: vbaProject.bin AANWEZIG, extractie GELUKT ✅ → vba.txt
`xl/vbaProject.bin` in de zip; olevba 0.60.2 extraheerde Module1 (enige niet-lege module; ThisWorkbook + 23 Blad-modules leeg):
- **BepaalFIRE**: pensioen → B16:=ES!C15; anders verse bisectie 0…(100−leeftijd)·12 op B38≥0 met eerst een haalbaarheidscheck op de horizon (B38<0 → unreachable, B16 blijft op horizon); statuscellen ná de bisectie gelezen; B100 en MsgBox. Het v4-stale-B16-probleem is algoritmisch weg (start altijd from scratch); staleness ontstaat alleen nog door inputwijzigingen ná een run — precies wat B95 detecteert.
- **RunScenarioBand**: per scenario (B42) zelfde bisectie → Sim!B6:D8 (CVErr #N/A bij onhaalbaar); herstelt "Verwacht" + B16:=Sim!B7.
- **RunMonteCarlo**: loop MC!B11 = 1..MC!B1 met B5=1, schrijft MC!B8 per run naar B14+; seeding zit deterministisch in de sheetformules (sin-hash), niet in VBA.

## h) Fout-cellen (cached): NUL ✅
Volledige scan van alle 23 sheets op cached #VALUE!/#REF!/#DIV/0!/#NAME?/#N/A/#NULL!/#NUM!/#SPILL!/#CALC!: **0 gevonden** (raw_errors.json = leeg). NB: de `_xlpm.*` defined names tonen "#NAME?" in de names-lijst — dat zijn interne LET-parameternamen, geen celfouten.

## Extra bevindingen t.o.v. het v4-beeld
- **P!B54-dode-knop**: niet verwijderd maar **bedraad** — P!B54 → ES!C13 → P!B37 (meetlat I vs J) én MC!B8 (slaagcriterium). Fix bevestigd.
- **Verkoop-slot-hardcoding**: niet weggeabstraheerd maar tot **bewaakt contract** gemaakt: Controle!K8 (huis móét op bens rij 6) en K9 (hypotheek op rij 17) worden rood zodra iemand ervan afwijkt; opeethypotheek heeft dedicated slot bens rij 20 ("auto — P!B57"), tekort-lening rij 23.
- Backtest (Hist) is scaffolding: reeks 1928-2023 zonder data, B2=0. MC: 200 opgeslagen runs (slaagkans 0,535) terwijl B1 nu 10 is — ook een bevroren-resultaat-artefact.
- Nieuw in v5 vs v4-beeld: per-pot idiosyncratische MC-ruis (MC!C12:L12), Werk-strategie-tab (J), Toelichting model-tab (zelf-documentatie), solver-statusblok (I), reconciliatie-invarianten K8-K11, Rapport-woningcontroles/gebeurtenissenoverzicht, perspectief-schakelaar Rapport!F2.
