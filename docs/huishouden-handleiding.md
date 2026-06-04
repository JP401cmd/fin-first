# Huishouden — hoe het werkt & hoe je het test

## Wat het doet
Koppel een **partner met een eigen account**. De hele app kent dan **3 perspectieven**:

| Perspectief | Wat je ziet |
|---|---|
| **Eigen** | Jouw persoonlijke items + **jouw aandeel** van gedeelde items |
| **Huishouden** | Alles samen, volledige bedragen (gedeeld telt één keer) |
| **Partner** | De items van je partner (volgens diens privacy) + partner-aandeel van gedeeld |

Twee begrippen:
- **Eigendom** per item: *Persoonlijk* of *Gedeeld* (kies je bij toevoegen/bewerken via de Persoonlijk/Gedeeld-knop). Gedeeld wordt verdeeld via de **split-modus** (50/50, inkomensratio, aangepast %, of "één draagt alles").
- **Privacy** per categorie (vermogen / schulden / budgetten / transacties / inkomen): **Volledig**, **Totalen** of **Verborgen**. Gedeelde items zijn altijd voor beiden volledig zichtbaar; alleen *persoonlijke* items van je partner worden afgeschermd. Standaard = **Totalen**.

---

## Eenmalig opzetten (± 2 min)
1. Log in als **hoofdgebruiker** → ga naar **Mijn → Profiel**.
2. Sectie *Huishouden* → vul het e-mailadres van je partner in → **Uitnodigen**. (Het huishouden wordt automatisch aangemaakt.)
3. Log in als **partner** (eigen account) → **Mijn → Profiel** → bij *ontvangen uitnodigingen* → **Accepteren**.
4. Klaar — beide accounts zitten nu in hetzelfde huishouden.

> Tip: de **perspectief-wisselaar** (Eigen / Huishouden / Partner) verschijnt pas nadat de koppeling actief is.

---

## Testscenario (2 accounts)

**Voorbereiding — voer met beide accounts wat data in:**
- Account A: 1× bezitting **Persoonlijk** + 1× bezitting **Gedeeld**.
- Account B: 1× bezitting **Persoonlijk**.
- Eventueel hetzelfde voor een schuld en een paar transacties.

**Stap 1 — Perspectief wisselen (account A)**
Wissel boven in de wisselaar tussen Eigen / Huishouden / Partner en controleer op **/overzicht/bezittingen** en **/overzicht/schulden**:

| Perspectief | Verwacht totaal bezittingen |
|---|---|
| Eigen | A-persoonlijk + **50%** van gedeeld |
| Huishouden | A-persoonlijk + B-persoonlijk + **100%** van gedeeld |
| Partner | B-persoonlijk (volgens privacy) + **50%** van gedeeld |

**Stap 2 — "Van wie is dit" (badges)**
Op de kaarten zie je een herkomst-label: **Gezamenlijk** (gedeeld), **Partner**/de partnernaam (van je partner), of niets bij je eigen items in het Eigen-perspectief. Bij gedeelde items staat een subregel *"Jouw aandeel: € …"*.

**Stap 3 — Privacy testen**
Zet bij account B een categorie (bv. *vermogen*) op **Verborgen** → bij account A verdwijnen B's *persoonlijke* bezittingen uit het Partner/Huishouden-beeld (met melding "vraag je partner om te delen"); gedeelde items blijven zichtbaar. Zet op **Totalen** → je ziet één samengevatte regel i.p.v. losse items.

**Stap 4 — Doorwerking controleren**
Wissel van perspectief en kijk of de cijfers consistent meebewegen op:
- **Cashflow + Budgetten** (gedeelde budgetten tellen beide partners; vaste lasten/transacties hebben herkomst-badges)
- **Belasting** → Box 3 toont de **gecombineerde** berekening + "optimale verdeling spaart € …"; Box 1 toont in huishoud-view **twee** jaarruimte-kaarten
- **Toekomst / FIRE** → gecombineerde projectie met **beide** AOW-stromen

**Stap 5 — Ontkoppelen**
**Mijn → Profiel → Huishouden verlaten**. Alle gedeelde items gaan terug naar *persoonlijk* bij de oorspronkelijke maker; beide accounts staan weer solo. (Historie blijft bewaard.)

---

## Wat moet kloppen (snelle checklist)
- [ ] Uitnodigen + accepteren lukt zonder foutmelding
- [ ] De 3 perspectieven geven verschillende, kloppende totalen
- [ ] Herkomst-badges + "jouw aandeel"-subregel staan op de kaarten
- [ ] Privacy *Verborgen/Totalen* schermt partner-persoonlijke data correct af
- [ ] Belasting (Box 3) en FIRE rekenen gecombineerd
- [ ] Verlaten zet alles netjes terug naar solo

## Aandachtspunten (bekend)
- Een **solo-gebruiker** (geen koppeling) ziet exact hetzelfde als voorheen — perspectieven zijn dan onzichtbaar.
- Uitnodigingen worden **nog niet per e-mail** verstuurd; de partner accepteert via de app (ontvangen-uitnodigingen).
- De huishoud-naam kan in het *ontvangen-uitnodiging*-lijstje (vóór accepteren) nog leeg zijn — accepteren werkt gewoon.
- Dashboard-landing/widgets, AI/briefing en transactie-import-eigendom zijn nog **niet** perspectief-bewust (losse vervolgstappen).
