# -*- coding: utf-8 -*-
"""Injecteer de app-KernelInput (eigenaar-live) in het Excel-oracle en extraheer een fixture.

EENMALIGE end-to-end verificatie (NIET committen). Leest de door
`dump-eigenaar-live.test.ts` gedumpte `kernel-input.json` en schrijft die als
INVOER-cellen naar een KOPIE van Core calc v5.xlsm — de INVERSE van
`lib/horizon-kernel/input-from-fixture.ts`. Hergebruikt het macro-/verificatie-
protocol van `extract_fixtures.extract_scenario` (BepaalFIRE→RunScenarioBand→
BepaalFIRE→RunMonteCarlo + Controle!K1 + stale-detector). Output: een fixture
`eigenaar-live.json.gz` (default in de scratchpad, --out om te sturen).

Draai:
  py scripts/horizon-oracle/inject_eigenaar_live.py \
     --kernel-input "<scratchpad>/eigenaar-live/kernel-input.json" \
     --out "<scratchpad>/eigenaar-live"

De bron-Excel wordt nooit geopend/gewijzigd (extract_scenario werkt op een kopie).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract_fixtures as ef  # noqa: E402

# ── celhelpers ────────────────────────────────────────────────────────────────
OV: list = []


def put(cell: str, value, reason: str) -> None:
    OV.append({"cell": cell, "value": value, "reason": reason})


# ASSET/DEBT slot → bens-rij (input-from-fixture: ASSET_ROW_START=4, DEBT_ROW_START=17)
def asset_row(slot: int) -> int:
    return 4 + slot


def debt_row(slot: int) -> int:
    return 17 + slot


# TS 'Eigen indeling'-kolommen (uit basis-fixture geverifieerd):
#   toename bezit rij 32-37 kolom G; toename schuld rij 40-44 kolom G;
#   afname rij 52-57 kolom F; onttrekking rij 65-70 kolom F.
BEZIT_TS_ROWS = {"Spaargeld": 0, "Beleggingen": 1, "Pensioen": 2, "Vastgoed": 3, "Eigen huis": 4, "Overig": 5}
SCHULD_TS_ROWS = {"Woning": 40, "Consumptief": 41, "Studie": 42, "Zakelijk": 43, "Overig": 44}


def janee(b: bool) -> str:
    return "Ja" if b else "Nee"


def build_overrides(ki: dict) -> None:
    # ── Persoon / tijdas (P!B7 = formule =B6-B5, niet schrijven) ──────────────
    p = ki["persoon"]
    put("P!B5", p["geboortejaar"], "geboortejaar (persoon.geboortejaar)")
    put("P!B6", p["startjaar"], "startjaar (persoon.startjaar)")
    put("P!B55", p["aowLeeftijd"], "AOW-leeftijd (persoon.aowLeeftijd; aow_leeftijd-tabel)")

    # ── Inkomen/uitgaven ──────────────────────────────────────────────────────
    iu = ki["inkomenUitgaven"]
    put("P!B10", iu["nettoJaarinkomen"], "netto jaarinkomen")
    put("P!B11", iu["nettoJaaruitgaven"], "netto jaaruitgaven")
    put("P!B15", iu["uitgaveNaPensioenPerJaar"], "uitgave na pensioen/jaar")
    put("P!B14", ki["inflatie"], "inflatie")
    put("P!B25", ki["tekortLeningRente"], "rente tekort-lening")

    # ── Box 3 (constanten uit BOX3_PARAMS; B19/B92 zijn formules) ─────────────
    b3 = ki["box3"]
    put("P!B18", b3["heffingvrijVermogenPP"], "Box3 heffingvrij vermogen p.p.")
    put("P!B20", b3["tarief"], "Box3 tarief")
    put("P!B21", b3["forfaitSpaar"], "Box3 forfait spaargeld")
    put("P!B22", b3["forfaitOverig"], "Box3 forfait overige bezittingen")
    put("P!B23", b3["forfaitSchuld"], "Box3 forfait schulden")
    put("P!B24", b3["schuldendrempelPP"], "Box3 schuldendrempel p.p.")
    put("P!B90", b3["method"], "Box3-methode")
    # heffingvrijInkomenTotaal = B91 * personen; personen=1 → B91 = totaal
    put("P!B91", b3["heffingvrijInkomenTotaal"] / max(1, b3["personen"]), "Box3 heffingvrij inkomen p.p. (B92=B91*B19)")

    # ── Strategie-selectors: 'Eigen indeling' (matrix-kolom G/F draagt de prio's) ─
    put("P!B28", "Eigen indeling", "toename-strategie = Eigen indeling (matrix G-kolom)")
    put("P!B29", "Eigen indeling", "afname-strategie = Eigen indeling (matrix F-kolom)")
    put("P!B30", "Eigen indeling", "onttrekking-strategie = Eigen indeling (matrix F-kolom)")

    # ── Eindstrategie ─────────────────────────────────────────────────────────
    es = ki["eindstrategie"]
    put("P!B48", es["selector"], "eindstrategie")
    put("P!B51", es["eindleeftijdOpeten"], "eindleeftijd opeten")
    put("P!B52", es["eindleeftijdNalatenschap"], "eindleeftijd nalatenschap")
    put("P!B53", es["nalatenschapBedrag"], "nalatenschapbedrag")
    put("P!B54", es["nietLiquideMeetellen"], "niet-liquide meetellen")

    # ── Woning ────────────────────────────────────────────────────────────────
    w = ki["woning"]
    put("P!B57", w["selector"], "woning-strategie")
    put("P!B58", w["trigger"], "verkoop-trigger")
    put("P!B59", w["verkoopleeftijd"], "verkoopleeftijd/fallback")
    put("P!B60", w["drempelMaandenUitgave"], "drempel maanden-uitgave")
    put("P!B61", w["verkoopprijsPctWoz"], "verkoopprijs % WOZ")
    put("P!B62", w["verkoopkostenPct"], "verkoopkosten %")
    put("P!B63", w["huurNaVerkoopPctWozPerJaar"], "huur na verkoop % WOZ/jr")
    put("P!B64", w["opeetStartleeftijdOpname"], "opeet startleeftijd (inert)")
    put("P!B65", w["opeetMaxLeningPctOverwaarde"], "opeet max % overwaarde (inert)")
    put("P!B66", w["opeetRentePerJaar"], "opeet rente (inert)")
    put("P!B67", w["opeetMaandopname"], "opeet maandopname (leeg=auto, inert)")

    # ── Onttrekkingsprofiel ───────────────────────────────────────────────────
    op = ki["onttrekkingsprofiel"]
    put("P!B69", op["profiel"], "onttrekkingsprofiel")
    put("P!B71", op["fase1TotLeeftijd"], "fase 1 t/m leeftijd")
    put("P!B72", op["factor1Pct"], "factor 1")
    put("P!B73", op["fase2TotLeeftijd"], "fase 2 t/m leeftijd")
    put("P!B74", op["factor2Pct"], "factor 2")
    put("P!B75", op["factor3Pct"], "factor 3")
    put("P!B77", op["guardrailFloor"], "guardrails floor")
    put("P!B78", op["guardrailCeiling"], "guardrails ceiling")
    put("P!B79", op["guardrailOnderdrempelRatio"], "guardrails onderdrempel-ratio")
    put("P!B80", op["guardrailBovendrempelRatio"], "guardrails bovendrempel-ratio")
    put("P!B81", op["guardrailStap"], "guardrails stap")

    # ── TS-prio's → 'Eigen indeling'-matrixkolommen (weight-kolommen recomputen) ─
    for c in ki["ts"]["bezitCategorien"]:
        r = 32 + BEZIT_TS_ROWS[c["categorie"]]
        put(f"TS!G{r}", c["prioToename"], f"toename-prio {c['categorie']} (Eigen indeling)")
        put(f"TS!F{52 + BEZIT_TS_ROWS[c['categorie']]}", c["prioAfname"], f"afname-prio {c['categorie']}")
        put(f"TS!F{65 + BEZIT_TS_ROWS[c['categorie']]}", c["prioOnttrekking"], f"onttrekking-prio {c['categorie']}")
    # Schuld-toename onder 'Eigen indeling': app prioAflossing=null → geen surplus-aflossing.
    # A23-controle eist een prio op GEVULDE, LIQUIDE categorieen. Prio 6 wordt NIET geaccepteerd
    # (blijft "zonder prioriteit"); prio 5 = reserve (idem basis-fixture D41/D42). Inert hier:
    # Beleggingen (prio 1) absorbeert al het overschot -> geen restant -> reserve-schuld krijgt 0
    # -> geen aflossing (= app-gedrag). Round-trip leest dan 5 i.p.v. null (immaterieel).
    for c in ki["ts"]["schuldCategorien"]:
        lbl = c["categorie"]
        if lbl == "Tekort-lening":
            continue
        r = SCHULD_TS_ROWS[lbl]
        put(f"TS!G{r}", 5, f"schuld-toename {lbl}: prio 5 reserve (app null; inert want Beleggingen absorbeert alles)")

    # ── Bezittingen (bens rij 4-13) ───────────────────────────────────────────
    filled_asset_rows = set()
    for pot in ki["assetPotten"]:
        r = asset_row(pot["slot"])
        filled_asset_rows.add(r)
        put(f"bens!A{r}", pot["naam"], f"bezitting naam slot {pot['slot']}")
        put(f"bens!B{r}", pot["startwaarde"], f"bezitting startwaarde slot {pot['slot']}")
        put(f"bens!C{r}", pot["rendement"], f"bezitting rendement slot {pot['slot']}")
        put(f"bens!D{r}", pot["box3Type"], f"bezitting box3-type slot {pot['slot']}")
        put(f"bens!E{r}", pot["categorie"], f"bezitting categorie slot {pot['slot']}")
        put(f"bens!F{r}", 1 if pot["investering"] else 0, f"bezitting investering-vlag slot {pot['slot']}")
    for r in range(4, 14):
        if r in filled_asset_rows:
            continue
        for col in ("A", "B", "C", "D", "E", "F"):
            put(f"bens!{col}{r}", None, f"leeg bezitting-slot rij {r}")

    # ── Schulden (bens rij 17-23; tekort rij 23 = formule-slot, ongemoeid) ────
    filled_debt_rows = set()
    for pot in ki["schuldPotten"]:
        r = debt_row(pot["slot"])
        if pot.get("rol") == "tekortLening":
            filled_debt_rows.add(r)  # rij 23: box3/rente/categorie via formule — niet schrijven
            continue
        filled_debt_rows.add(r)
        put(f"bens!A{r}", pot["naam"], f"schuld naam slot {pot['slot']}")
        put(f"bens!B{r}", pot["startwaarde"], f"schuld startwaarde slot {pot['slot']}")
        put(f"bens!C{r}", pot["aflossingPct"], f"schuld aflossing% slot {pot['slot']}")
        put(f"bens!D{r}", pot["aflossingEur"], f"schuld aflossing€/jr slot {pot['slot']}")
        put(f"bens!E{r}", pot["rente"], f"schuld rente slot {pot['slot']}")
        put(f"bens!F{r}", pot["box3Type"], f"schuld box3-type slot {pot['slot']}")
        put(f"bens!G{r}", janee(pot["liquide"]), f"schuld liquide slot {pot['slot']}")
        put(f"bens!H{r}", janee(pot["inSparenNaAflossing"]), f"schuld in-sparen-na-aflossing slot {pot['slot']}")
        put(f"bens!I{r}", pot["categorie"], f"schuld categorie slot {pot['slot']}")
    for r in range(17, 23):  # 17..22 (23 = tekort-formuleslot, laten staan)
        if r in filled_debt_rows:
            continue
        for col in ("A", "B", "C", "D", "E", "F", "G", "H", "I"):
            put(f"bens!{col}{r}", None, f"leeg schuld-slot rij {r}")

    # ── Auto-gebeurtenissen (AOW/kinderen/erfenis + pensioen-multipot) ────────
    ag = ki["autoGebeurtenissen"]
    put("Auto-gebeurtenissen!B4", ag["leefsituatie"], "leefsituatie")
    put("Auto-gebeurtenissen!B5", ag["aowOpbouwjaren"], "AOW-opbouwjaren")
    put("Auto-gebeurtenissen!B8", ag["aantalKinderen"], "aantal kinderen")
    put("Auto-gebeurtenissen!B9", ag["kindGeboorteLeeftijden"][0], "kind1 geboorte-leeftijd")
    put("Auto-gebeurtenissen!B10", ag["kindGeboorteLeeftijden"][1], "kind2 geboorte-leeftijd")
    put("Auto-gebeurtenissen!B11", ag["kindGeboorteLeeftijden"][2], "kind3 geboorte-leeftijd")
    put("Auto-gebeurtenissen!B12", ag["nibudBasisPerMaand"], "NIBUD basis/mnd")
    put("Auto-gebeurtenissen!B13", ag["kinderopvangNettoPerMaand"], "kinderopvang netto/mnd")
    put("Auto-gebeurtenissen!B14", ag["kinderbijslagPerMaand"], "kinderbijslag/mnd")
    put("Auto-gebeurtenissen!B15", ag["babyuitzetEenmalig"], "babyuitzet eenmalig")
    put("Auto-gebeurtenissen!B16", ag["erfenisBruto"], "erfenis bruto")
    put("Auto-gebeurtenissen!B18", ag["erfenisLeeftijd"], "erfenis leeftijd")

    PENSIOEN_ROW_START = 26
    filled_pens = set()
    for pot in ag["pensioenPotten"]:
        r = PENSIOEN_ROW_START + pot["slot"]
        filled_pens.add(r)
        put(f"Auto-gebeurtenissen!A{r}", pot.get("naam"), f"pensioen naam slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!B{r}", pot.get("type"), f"pensioen type slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!C{r}", pot.get("ingangsLeeftijd"), f"pensioen ingangsleeftijd slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!D{r}", pot.get("invoermodus"), f"pensioen invoermodus slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!E{r}", pot.get("brutoPerMaand"), f"pensioen bruto/mnd slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!F{r}", pot.get("inlegPot"), f"pensioen inleg slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!G{r}", pot.get("duurJaarInvoer"), f"pensioen duur-jr slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!H{r}", pot.get("geindexeerd"), f"pensioen geindexeerd slot {pot['slot']}")
        put(f"Auto-gebeurtenissen!I{r}", pot.get("partnerUitkeringPct"), f"pensioen partner% slot {pot['slot']}")
    for r in range(26, 32):
        if r in filled_pens:
            continue
        for col in ("A", "B", "C", "D", "E", "F", "G", "H", "I"):
            put(f"Auto-gebeurtenissen!{col}{r}", None, f"leeg pensioen-slot rij {r}")

    # ── Geb handmatig rij 4-13: app heeft geen handmatige gebeurtenissen → leeg ─
    for r in range(4, 14):
        for col in ("A", "B", "C", "I", "J", "P", "Q"):  # naam + type + bedrag per post
            put(f"Geb!{col}{r}", None, f"leeg handmatige-gebeurtenis rij {r}")

    # ── Werk-strategie (app neutraal: basis 0, groei 0 → delta 0) ─────────────
    ws = ki["werkStrategie"]
    put("Werk-strategie!B1", ws["basisNettoPerMaand"], "werk basis netto/mnd (app 0; overschrijft =P!B10/12)")
    put("Werk-strategie!B2", ws["reeleGroei"], "werk reele groei (0 = uit)")
    put("Werk-strategie!B4", ws["plafondNettoPerMaand"], "werk plafond")

    # ── Onzekerheid: MC/Hist inert (raken solveFire + grid niet; voor round-trip) ─
    onz = ki["onzekerheid"]
    put("MC!B1", onz["mc"]["aantalRuns"], "MC runs (inert)")
    put("MC!B3", onz["mc"]["sigma"], "MC sigma (inert)")
    put("MC!B5", 1 if onz["mc"]["actief"] else 0, "MC actief (uit)")
    put("Hist!B1", onz["hist"]["startjaar"], "Hist startjaar (inert)")
    put("Hist!B2", 1 if onz["hist"]["actief"] else 0, "Hist actief (uit)")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Injecteer eigenaar-live KernelInput in Core calc v5.xlsm")
    ap.add_argument("--kernel-input", required=True, help="pad naar kernel-input.json (uit de dump)")
    ap.add_argument("--source", default=ef.DEFAULT_SOURCE, help=f"bron-Excel (default: {ef.DEFAULT_SOURCE})")
    ap.add_argument("--out", required=True, help="outputmap voor eigenaar-live.json.gz")
    args = ap.parse_args(argv)

    with open(args.kernel_input, "r", encoding="utf-8") as f:
        ki = json.load(f)
    build_overrides(ki)
    print(f"[inject] {len(OV)} override-cellen gegenereerd uit {args.kernel_input}")

    scenario = {
        "name": "eigenaar-live",
        "description": (
            "End-to-end verificatie: de app-KernelInput (Supabase -> adapter) van de eigenaar "
            "(jpsmit@jps-holding.nl) 1:1 als invoer in Core calc v5.xlsm (inverse van "
            "input-from-fixture.ts). Selectors 'Eigen indeling' + resolved TS-prio's in de matrix."
        ),
        "overrides": OV,
        "warnings": [
            "Injectie van de LIVE app-data; niet de statische eigenaar-snapshot. "
            "Bron-SHA kan afwijken van de analyse-snapshot (structuur mogelijk verouderd) — zie meta.warnings.",
        ],
    }

    ef.pythoncom.CoInitialize()
    result = ef.extract_scenario(scenario, os.path.abspath(args.source), os.path.abspath(args.out))
    print("\n== RESULTAAT ==")
    print(json.dumps({k: v for k, v in result.items() if k != "warnings"}, ensure_ascii=False, indent=2))
    for w in result.get("warnings", []):
        print("  warning:", w)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
