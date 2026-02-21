# Fase 10 — AI-Advieslaag

*Aangemaakt: 2026-02-21 | Vorige fase: Alle andere fasen*

---

## Doel

Verdieping van de AI-advieslaag voor budgetspecifieke inzichten. De AI-context-modules (Fhin/Finn/Ffin) bestaan al, maar budget-specifieke triggers en analyses ontbreken.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F10-01 | Als gebruiker wil ik proactieve AI-adviezen ontvangen als ik een budget overschrijd | Hoog |
| F10-02 | Als gebruiker wil ik AI-analyse van mijn uitgavenpatronen per categorie | Hoog |
| F10-03 | Als gebruiker wil ik AI-suggesties voor het optimaliseren van mijn budgetverdeling | Middel |
| F10-04 | Als gebruiker wil ik AI-prognoses voor toekomstige maanden op basis van historische data | Middel |
| F10-05 | Als gebruiker wil ik AI-commentaar bij ongebruikelijke transacties | Laag |
| F10-06 | Als gebruiker wil ik AI-advies over de impact van schulden op mijn vrijheidstijd | Middel |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Will DNA (`lib/ai/dna/wil.ts`) | ✅ Bestaat | Centrale assistent met alle expertise-domeinen |
| Budget context voor Will | ⚠️ Deels | Basiscontext aanwezig, geen budget-overschrijd triggers |
| Proactieve budget-alerts via Will | ❌ Ontbreekt | Geen trigger-systeem |
| Patroon-analyse via Will | ❌ Ontbreekt | Will krijgt geen 12-maands data mee |
| Budget-optimalisatie suggesties | ❌ Ontbreekt | Geen NIBUD-vergelijking in Will-context |
| Vrijheidstijd impact berekening | ⚠️ Deels | `freedom-time-label.tsx` bestaat, niet in Will-context |

---

## Architectuurbeslissing

Will's DNA (`lib/ai/dna/wil.ts`) geeft al een brede context mee. Uitbreiding = meer budget-specifieke data toevoegen aan de context die Will meekrijgt:
1. **Budget overschrijd-data**: welke budgetten zijn rood/oranje
2. **12-maands patroon**: gemiddeld per categorie vs. dit maandbedrag
3. **NIBUD vergelijking**: eigen bedragen vs. NIBUD-referentie
4. **Vrijheidstijd impact**: elk budget in vrije dagen

Will is de enige AI-assistent (`avatarName: 'Will'`). De kern/horizon domeinen (`lib/ai/dna/kern.ts`, `lib/ai/dna/horizon.ts`) zijn context-modules, geen losse personages.

---

## Implementatiestappen

### Stap 10.1 — Budget alert triggers
In `/api/ai/chat/route.ts` (de centrale Will-chat route):
- Voeg budget-overschrijd data toe aan de context die Will meekrijgt:
  ```
  overschreden_budgetten: [{ naam, limiet, besteed, pct }]
  bijna_vol_budgetten: [{ naam, limiet, besteed, pct }]
  ```
- Will gebruikt `suggestAction` tool om proactief acties voor te stellen

### Stap 10.2 — 12-maands patroon in context
Voeg historische aggregatie toe aan AI-context:
- Gemiddeld per budget over 12 maanden
- Trend (stijgend/dalend/stabiel)
- Verander maand vs. gemiddeld (afwijking)

### Stap 10.3 — NIBUD vergelijking
Voeg NIBUD-data toe aan context:
- Haal `nibud_reference_data` op voor gebruikersprofiel
- Vergelijk eigen limieten met NIBUD-richtlijnen
- AI kan suggesties doen ("je besteedt X% meer aan boodschappen dan gemiddeld")

### Stap 10.4 — Vrijheidstijd impact per budget
Voeg toe aan context:
- `dagelijkse_uitgavenratio` (uit `freedom-time-label.tsx`)
- Per budget: equivalent in vrijheidsdagen
- AI kan zeggen: "Je vakantiebudget kost je 8 vrijheidsdagen per jaar"

### Stap 10.5 — Budget-chat in BudgetDetailModal
Voeg toe aan BudgetDetailModal:
- "Vraag Will" knop → opent AI-chat (`ChatPanel`) met budget-context
- Pre-filled prompt: "Analyseer mijn {budgetnaam} budget"
- Geeft Will het specifieke budget mee als context via het bestaande chat-systeem

---

## Verificatie

- [ ] AI geeft proactief advies bij budget-overschrijd (>85%)
- [ ] Patroon-analyse verschijnt in AI-respons
- [ ] NIBUD vergelijking wordt gebruikt in suggesties
- [ ] Vrijheidstijd impact wordt benoemd in AI-context

---

## Handoff Context (Eindpunt)

Na Fase 10 is de budgetmodule volledig. Volgende prioriteiten:
- Foutopsporing en performance-optimalisatie
- A/B testing van AI-adviezen
- Gebruikersfeedback verwerken

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
