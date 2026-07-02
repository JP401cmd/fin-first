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

Uitbreiding (16 scenario's): 'huis-meerekenen' en 'huis-uitsluiten' completeren het
P!B57-kwadrant; 'onhaalbaar' en 'pensioen-tekort' dekken de twee solver-statussen
die de eerste 12 fixtures niet raakten (unreachable_within_horizon en
pension_shortfall). Bij die laatste twee is de invoer-keuze empirisch bepaald:
een echte maand-tekortdraai VOOR FIRE (uitgaven > inkomen) breekt de
reconciliatie van het model (Controle!K1 FOUT — potten onder de MAX(0;..)-vloer
gedrukt door een negatief toename-budget), dus 'onhaalbaar' draait aan het doel
en 'pensioen-tekort' aan de post-FIRE-uitgaven (het onttrekking-onbenut-pad naar
de tekort-lening is wel gereconcilieerd). Zie de reasons/warnings per scenario.
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
    {
        "name": "huis-meerekenen",
        "description": (
            "Woning-strategie 'Meerekenen': huis en woningschuld tellen mee in het liquide vermogen "
            "(TS!H9/H16 worden 'Nee' via hun formule) en het huis doet als categorie mee in de "
            "afname/onttrekking-waterval; geen verkoop- of opeetpad; verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "P!B57", "value": "Meerekenen", "reason": "scenario: woning-strategie Meerekenen (basis = Verkopen)"},
            {
                "cell": "TS!D40",
                "value": 5,
                "reason": (
                    "verlengstuk van de TS!A23-fix: onder 'Meerekenen' wordt de schuld-categorie Woning liquide "
                    "(TS!H16 -> 'Nee') en valt daarmee binnen de prioriteiten-controle, maar de toename-kolom "
                    "'gelijk verdelen over bezittingen' heeft voor Woning geen prio (D40 leeg in de bron) -> "
                    "TS!A23 'FOUT: 1 gevulde categorie(en) zonder prioriteit'. Prio 5 = reserve (alleen restant-"
                    "budget), dezelfde waarde die de controle voor Consumptief/Studie accepteert; in basis staat "
                    "Woning buiten de waterval (niet-liquide, gewicht 0)"
                ),
            },
        ],
        "warnings": [
            "Onder 'Meerekenen' doet de hypotheek (Woning) door de vereiste prio 5 als reserve mee in de "
            "toename-aflossing-waterval; dit is een noodzakelijk gevolg van de prioriteiten-controle en wijkt "
            "in die zin af van basis (waar Woning als niet-liquide categorie gewicht 0 heeft).",
        ],
    },
    {
        "name": "huis-uitsluiten",
        "description": (
            "Woning-strategie 'Uitsluiten': huis en woningschuld blijven volledig buiten de FIRE-som "
            "(TS!H9/H16 blijven 'Ja', net als bij Verkopen) maar er is geen verkoop-, huur- of opeetpad "
            "(Bez!AY blijft 0); verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "P!B57", "value": "Uitsluiten", "reason": "scenario: woning-strategie Uitsluiten (basis = Verkopen)"},
        ],
        "warnings": [],
    },
    {
        "name": "onhaalbaar",
        "description": (
            "FIRE onbereikbaar binnen de horizon: nalatenschapsdoel 10.000.000 (koopkracht-nu) bij "
            "woning-strategie 'Uitsluiten' -> BepaalFIRE parkeert P!B16 op de horizon (leeftijd 100), "
            "B38 blijft < 0 -> status 'unreachable_within_horizon' + gevulde EUR/mnd-extra-sparen-hint "
            "(P!B96, ook verweven in melding P!B94). fireAge is null in meta (B16 = 100 is een parkeerstand, "
            "geen oplossing)."
        ),
        "overrides": [
            {
                "cell": "P!B53",
                "value": 10000000,
                "reason": (
                    "scenario: onhaalbaar doel — de instructie-route 'uitgaven fors omhoog en/of inkomen omlaag' "
                    "is empirisch NIET extraheerbaar: elke echte maand-tekortdraai (bv. P!B11=120.000) maakt het "
                    "toename-budget CF!I negatief, duwt potten tegen de MAX(0;..)-vloer en breekt de eigen "
                    "reconciliatie van het model (Controle!K1 'FOUT — zie tabel', 589 foutmaanden; de tekort-lening "
                    "voedt alleen uit afname/onttrekking-onbenut, niet uit negatief sparen). Het doelbedrag is de "
                    "kleinste ingreep die betrouwbaar unreachable geeft en alle kasstromen in het gereconcilieerde "
                    "domein houdt (doel 10M x 1,02^54 = 29,1M nominaal op 90 >> J(90) = 9,1M bij doorsparen tot 100)"
                ),
            },
            {
                "cell": "P!B57",
                "value": "Uitsluiten",
                "reason": (
                    "nodig voor een schone unreachable-stand: onder 'Verkopen' verkoopt het huis op de "
                    "fallback-leeftijd 75 en wordt met B16 geparkeerd op 100 het vermogen zo groot (~13,5M) dat de "
                    "maandelijkse Box 3-heffing (CF!K ~23k/mnd) + huur het inkomen overstijgt -> CF!I negatief -> "
                    "zelfde pot-vloer-reconciliatiebreuk (20 Controle-foutmaanden, leeftijd 98,3-100). Met "
                    "'Uitsluiten' sluit alles (Controle!K1 OK, 0 foutmaanden; empirisch geverifieerd)"
                ),
            },
        ],
        "warnings": [
            "BepaalFIRE zonder oplossing: B16 wordt op de horizon geparkeerd (leeftijd + (100-leeftijd)*12/12 = 100) "
            "en blijft daar staan; B38 < 0 is de unreachable-conditie. Herdraaien laat B16/B38 exact ongewijzigd "
            "(idempotent geverifieerd).",
            "Stale-detector P!B95 blijft leeg bij status 'unreachable_within_horizon' (de detector is gebonden aan "
            "de reached_at-toestand); het versheidsbewijs is hier de idempotentie van de parkeerstand zelf.",
        ],
    },
    {
        "name": "pensioen-tekort",
        "description": (
            "Eindstrategie 'Pensioenleeftijd' (FIRE = AOW-kortsluiting, B16 := 67, geen bisectie) met uitgave "
            "na pensioen 200.000/jr (koopkracht-nu) die vanaf de AOW-datum niet gedekt is: de potten raken "
            "leeg, de tekort-lening loopt op tot ~15,8M t/m horizon 100 (P!B99 > 0) -> status "
            "'pension_shortfall' met melding 'Pensioengat: ...' (P!B94); verder gelijk aan basis."
        ),
        "overrides": [
            {"cell": "P!B48", "value": "Pensioenleeftijd", "reason": "scenario: eindstrategie pensioen (basis = Nalatenschap) — vereist voor de pension_shortfall-tak van P!B93"},
            {
                "cell": "P!B15",
                "value": 200000,
                "reason": (
                    "scenario: uitgaven na pensioen fors omhoog zodat de onttrekkingsbehoefte het vermogen "
                    "(~2,5M reeel op 67) ruim overstijgt; het tekort loopt via het gereconcilieerde "
                    "onttrekking-onbenut-pad (Verdeling!EO -> tekort-lening S!AB, Controle!K1 blijft OK) — "
                    "anders dan een pre-FIRE-tekortdraai, die de reconciliatie breekt"
                ),
            },
        ],
        "warnings": [
            "Stale-detector P!B95 blijft leeg bij status 'pension_shortfall' (net als bij 'reached_now'/"
            "'unreachable_within_horizon' — de detector is gebonden aan de reached_at-toestand). Het doelbedrag "
            "P!B36 is 0 bij eindstrategie pensioen; de gap P!B38 is dan gelijk aan het (diep negatieve) liquide "
            "vermogen op horizon 100 en is geen doel-afstand.",
            "De eerste BepaalFIRE in het macro-protocol kan door de handmatige rekenmodus nog de gecachte "
            "eindstrategie zien en een bisectie draaien; de tweede BepaalFIRE (na RunScenarioBand) zet B16 "
            "definitief op de AOW-leeftijd 67 — precies waarvoor het dubbele-BepaalFIRE-protocol bestaat.",
        ],
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
