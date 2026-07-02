# -*- coding: utf-8 -*-
"""Scenario-definities voor de Horizon-oracle fixture-extractor.

Basis = de situatie van de eigenaar in Core calc v5.xlsm (analyse-snapshot
2026-07-02 12:24, zie docs/horizon-oracle/):

    - Persoon: geboortejaar 1990, startjaar 2026 (leeftijd 36), netto inkomen
      45.000/jr, uitgaven 33.000/jr, uitgave na pensioen 40.000/jr, inflatie 2%.
    - Eindstrategie P!B48 = "Nalatenschap" (legacy): 100.000 koopkracht-nu op
      eindleeftijd 90, niet-liquide meetellen = Nee.
    - Onttrekkingsprofiel P!B69 = "Afnemend" (fasecurve 100/85/70 t/m 75/85).
    - Woning-strategie P!B57 = "Verkopen", trigger P!B58 = "Wanneer nodig"
      (drempel 24 mnd, fallback-leeftijd 75).
    - Partner PT!B2 = 0 (uit).
    - Werk-strategie ACTIEF: reele groei 2%/jr ('Werk-strategie'!B2 = 0,02);
      sprongen/deeltijd/plafond leeg.
    - Box 3-methode P!B90 = "forfaitair".

Elke extractie krijgt daarnaast ALTIJD de TS!A23-fix (ontbrekende toename-prio
voor Consumptief + Studie onder 'gelijk verdelen over bezittingen') als gelogde
override — die wordt dynamisch toegepast door extract_fixtures.py (label-zoektocht
in de mapping-matrix TS!C40:G44) en verschijnt in meta.overrides met reason
"TS!A23-fix ...".

Selector-cellen zijn met zekerheid geidentificeerd uit docs/horizon-oracle/inputs.json
(alle keuzelijst-opties letterlijk overgenomen). Er hoefde daarom geen scenario te
worden overgeslagen wegens een onzekere selector; wel vervallen drie scenario's
omdat ze identiek zouden zijn aan basis (zie SKIPPED_SCENARIOS).
"""

# Overrides: lijst van dicts {cell, value, reason}. De extractor schrijft ze in
# volgorde, leest ze terug ter verificatie en logt ze in meta.overrides.

SCENARIOS = [
    {
        "name": "basis",
        "description": (
            "Basisscenario — eigen situatie van de eigenaar (Nalatenschap 100k @90, "
            "profiel Afnemend, huis verkopen 'wanneer nodig', geen partner, werk-strategie "
            "2% reele groei, Box 3 forfaitair); alleen de TS!A23-prioriteitenfix."
        ),
        "overrides": [],
        "warnings": [],
    },
    {
        "name": "eind-deplete",
        "description": "Eindstrategie 'Vermogen opeten' (deplete) t/m eindleeftijd 90; verder gelijk aan basis.",
        "overrides": [
            {"cell": "P!B48", "value": "Vermogen opeten", "reason": "scenario: eindstrategie deplete (basis = Nalatenschap)"},
        ],
        "warnings": [],
    },
    {
        "name": "eind-perpetual",
        "description": "Eindstrategie 'Eeuwigdurend' (perpetual, reeel kapitaalbehoud t/m horizon 100); verder gelijk aan basis.",
        "overrides": [
            {"cell": "P!B48", "value": "Eeuwigdurend", "reason": "scenario: eindstrategie perpetual (basis = Nalatenschap)"},
        ],
        "warnings": [],
    },
    {
        "name": "eind-pensioen",
        "description": "Eindstrategie 'Pensioenleeftijd' (FIRE kortgesloten naar AOW-leeftijd 67, geen bisectie); verder gelijk aan basis.",
        "overrides": [
            {"cell": "P!B48", "value": "Pensioenleeftijd", "reason": "scenario: eindstrategie pensioen (basis = Nalatenschap)"},
        ],
        "warnings": [],
    },
    {
        "name": "profiel-vast",
        "description": "Onttrekkingsprofiel 'Vast' (factor 1, Controle!K10-invariant); verder gelijk aan basis (basisprofiel = Afnemend).",
        "overrides": [
            {"cell": "P!B69", "value": "Vast", "reason": "scenario: onttrekkingsprofiel Vast (basis = Afnemend; toegevoegd omdat basis niet 'Vast' is)"},
        ],
        "warnings": [],
    },
    {
        "name": "profiel-oplopend",
        "description": (
            "Onttrekkingsprofiel 'Oplopend' met gespiegelde fasecurve 70/85/100 (t/m 75/85) — "
            "Oplopend gebruikt in het model dezelfde fase-kolom Ont!F als Afnemend, dus met de "
            "basis-curve (100/85/70) zou dit scenario identiek zijn aan basis."
        ),
        "overrides": [
            {"cell": "P!B69", "value": "Oplopend", "reason": "scenario: onttrekkingsprofiel Oplopend (basis = Afnemend)"},
            {"cell": "P!B72", "value": 70, "reason": "oplopende curve: factor fase 1 (go-go) 100 -> 70; Ont!I gebruikt voor Oplopend dezelfde Ont!F-curve als Afnemend, dus de curve zelf moet oplopen"},
            {"cell": "P!B75", "value": 100, "reason": "oplopende curve: factor fase 3 (no-go) 70 -> 100 (fase 2 blijft 85)"},
        ],
        "warnings": [],
    },
    {
        "name": "profiel-guardrails",
        "description": (
            "Onttrekkingsprofiel 'Guardrails' (floor 0,8 / ceiling 1,2 / drempel-ratio's 0,8-1,2 / "
            "stap 0,1; referentie P!B82 = liquide maand voor FIRE); toestandloos per maand — "
            "deterministisch doet dit weinig (eigenaars-kanttekening op P!C69)."
        ),
        "overrides": [
            {"cell": "P!B69", "value": "Guardrails", "reason": "scenario: onttrekkingsprofiel Guardrails (basis = Afnemend)"},
        ],
        "warnings": [],
    },
    {
        "name": "huis-verkoop-vast",
        "description": "Woning-strategie 'Verkopen' met trigger 'Vaste leeftijd' (75) i.p.v. 'Wanneer nodig'; verder gelijk aan basis.",
        "overrides": [
            {"cell": "P!B58", "value": "Vaste leeftijd", "reason": "scenario: verkoop-trigger op vaste leeftijd (P!B59 = 75 blijft staan als verkoopleeftijd; basis = 'Wanneer nodig')"},
        ],
        "warnings": [],
    },
    {
        "name": "huis-opeethypotheek",
        "description": (
            "Woning-strategie 'Opeethypotheek' (startleeftijd opname 67, max 50% overwaarde, rente 5,5%, "
            "maandopname auto; dedicated slot bens rij 20 / S!P:S); verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "P!B57", "value": "Opeethypotheek", "reason": "scenario: woning-strategie opeethypotheek (basis = Verkopen)"},
        ],
        "warnings": [],
    },
    {
        "name": "partner-aan",
        "description": (
            "Fiscaal partner aan (PT!B2 = 1: geboortejaar 1992, netto 30.000/jr tot partner-AOW 67, "
            "AOW 18.000 p.p./jr; P!B19 wordt 2 -> dubbel heffingvrij vermogen en schuldendrempel); "
            "verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "PT!B2", "value": 1, "reason": "scenario: partner aanwezig (basis heeft geen partner -> 'partner-aan')"},
        ],
        "warnings": [
            "Auto-gebeurtenissen!B4 blijft 'Alleenstaand' (eigen AOW blijft op het alleenstaand-tarief 1452): "
            "bewust een-variabele-wijziging; de exacte keuzelijst-waarde voor een niet-alleenstaande "
            "leefsituatie is niet met zekerheid vastgesteld en er wordt niet gegokt.",
        ],
    },
    {
        "name": "werk-strategie-uit",
        "description": (
            "Werk-strategie uitgezet (reele groei 2% -> 0; sprongen/deeltijd/plafond waren al leeg; "
            "Controle!K11-invariant: uit-stand lekt niet). Basis heeft de werk-strategie al ACTIEF, "
            "dus de informatieve variant is 'uit' — analoog aan de partner-aan/uit-instructie."
        ),
        "overrides": [
            {"cell": "Werk-strategie!B2", "value": 0, "reason": "scenario: werk-strategie uit (basis heeft 2% reele groei actief; 'werk-strategie-aan' zou identiek zijn aan basis)"},
        ],
        "warnings": [],
    },
    {
        "name": "box3-werkelijk",
        "description": (
            "Box 3-methode 'werkelijk' (heffing 36% over werkelijk maandrendement minus heffingvrij "
            "inkomen 1.800 p.p./jr; verliesmaand -> 0, geen verliesverrekening); verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "P!B90", "value": "werkelijk", "reason": "scenario: Box 3 werkelijk rendement (basis = forfaitair)"},
        ],
        "warnings": [],
    },
]

# Scenario's uit de opdracht-set die bewust NIET worden geextraheerd omdat ze
# (op de TS-fix na, die overal in zit) identiek zouden zijn aan `basis`.
SKIPPED_SCENARIOS = [
    {
        "name": "eind-legacy",
        "reason": (
            "gelijk aan basis: de basis-eindstrategie is al 'Nalatenschap' (legacy) met "
            "nalatenschapbedrag 100.000 (koopkracht-nu), eindleeftijd 90 en niet-liquide "
            "meetellen = Nee."
        ),
    },
    {
        "name": "profiel-afnemend",
        "reason": "gelijk aan basis: het basisprofiel is al 'Afnemend' (curve 100/85/70 t/m 75/85); daarom is 'profiel-vast' aan de set toegevoegd.",
    },
    {
        "name": "huis-verkoop-wanneer-nodig",
        "reason": "gelijk aan basis: de basis-woningstrategie is al 'Verkopen' met trigger 'Wanneer nodig' (drempel 24 mnd uitgave, fallback-leeftijd 75).",
    },
]


def get_scenario(name):
    for s in SCENARIOS:
        if s["name"] == name:
            return s
    return None


def get_skipped(name):
    for s in SKIPPED_SCENARIOS:
        if s["name"] == name:
            return s
    return None
