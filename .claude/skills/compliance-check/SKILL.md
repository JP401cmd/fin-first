---
name: compliance-check
description: Gebruik vóór elke publicatie van publieke tekst (landing, SEO-pagina, funnel, social post, deelbaar asset), vóór elke wijziging aan prompt-DNA of AI-gedrag, bij elk /nieuws- of briefing-item dat over keuzes met geld gaat, en bij elke nieuwe claim over veiligheid, opslag of rendement. Toetst aan de Wft-grens (inzicht mag, vergunningsplichtig advies niet) en de claimlijst, en levert een beslisbare uitkomst — goedkeuren, aanpassen of afwijzen.
---

# Compliance-check — de Wft/AVG-poort vóór publicatie

**Eerste regel — de grens:** TriFinity geeft **inzicht**, geen **vergunningsplichtig advies**. Advies in Wft-zin is een aanbeveling over een specifiek financieel product aan een specifieke persoon. *Hoeveel heb ik nodig om te stoppen* is inzicht — een som op eigen data. *Waar moet ik het inleggen* is advies — en verboden terrein, hoe vaak de vraag ook gesteld wordt en hoe goed hij ook scoort in een zoekmachine.

## De grens, met voorbeelden

**Inzicht — mag:**
- rekensommen op de eigen situatie: benodigd vermogen, vrijheidstijd, spaarquote, FIRE-leeftijd;
- uitleg van begrippen en stelsels: hoe Box 3 werkt, wat een onttrekkingspercentage is, wat indexeren betekent;
- feitelijke, controleerbare vergelijkingen zonder aanbeveling ("bank A rekent X, bank B rekent Y");
- de vertaling van bedragen naar tijd — het kernidee.

**Advies — mag niet:**
- productaanbevelingen: welk fonds, welke broker, welke hypotheek, welke verzekering;
- persoonlijke instructies over inleggen, aflossen-of-beleggen, overstappen of oversluiten;
- ranglijsten of vergelijkingen die uitmonden in "kies dit";
- een generieke tekst die zó geformuleerd is dat de lezer hem als persoonlijk handelingsadvies leest ("mensen zoals jij zouden moeten…").

**Grijze zone — herformuleren of escaleren:**
- **rendementsaannames**: mogen als transparante, generieke aanname in een rekentool ("bij een aanname van X%"), nooit als voorspelling of belofte;
- **fiscale uitleg**: uitleggen hoe het werkt mag; "zet je geld in X om belasting te besparen" is advies;
- **onttrekkings-/decumulatiestrategieën**: als concept uitleggen mag; als persoonlijke instructie niet;
- twijfel? Herformuleer naar de inzicht-variant (laat de som zien in plaats van de conclusie te trekken) of leg voor via `legal-risk-assessment`. **Bij aanhoudende twijfel wint nee** — beter tien pagina's die mogen dan honderd die je later moet weghalen.

## De claimlijst

**Wél zeggen (hard te maken):** geen bankkoppeling nodig · versleutelde opslag · vaste bewaartermijnen · geen advertentietechniek of third-party tracking · export en verwijdering met één druk · en, mits precies zo geformuleerd: *de AI-chat draait in privacy-modus volledig op je eigen apparaat* (Gemma via LiteRT, ADR 0056 — de server blokkeert het cloudpad dan actief).

**Níét zeggen:** dat **alle** data op het apparaat blijft — gebruikersdata staat in de Supabase-cloud; soevereiniteit is motivatie, geen local-first (ADR 0001). De on-device-claim geldt uitsluitend voor de AI-chat in privacy-modus, nooit voor de app als geheel. Verder verboden: rendementsbeloftes, "gegarandeerd", elke formulering dat TriFinity advies geeft, en superlatieven die niet hard te maken zijn.

**AVG bij publieke content:** geen persoonsgegevens of herleidbare voorbeelden; echte cijfers of verhalen van gebruikers alleen met vastgelegde toestemming.

## De uitzonderingsroute

`/privacy`, `/voorwaarden` en `/wft` wijzigen **nooit** via `kleine-aanpassing` — altijd via deze poort, met een `juridische-brief`-aantekening (één pagina: wat wijzigt, waarom, gevolg). Deze regel staat ook in `CLAUDE.md` en in de poort van `kleine-aanpassing` zelf.

## De uitkomst — een besluit, geen gevoel

Elke toets eindigt in precies één van drie uitkomsten, altijd gemotiveerd:

1. **Goedkeuren** — met één zin waaróm dit binnen de grens valt.
2. **Aanpassen** — met de concrete herformulering erbij (niet alleen "dit mag niet"): laat zien hoe de inzicht-variant eruitziet.
3. **Afwijzen** — met de Wft- of AVG-reden, en waar mogelijk welk deel van het onderwerp wél zou mogen.

Leg de uitkomst vast als aantekening in **Notion · Juridische toetsen**: datum, wat getoetst, uitkomst, motivering. Dit is werkwijze, geen juridisch advies — bij een echt randgeval (nieuwe claimcategorie, dreigend geschil, twijfel over vergunningsplicht) hoort de vraag via `legal-risk-assessment` en zo nodig bij een jurist.

## Verwijzing

Stromen 02, 03, 04, 09 en 10 in `trifinity-org/org_plan/30-werkstromen.md` — dit is de [poort] die daar getekend staat. Verwant: `legal-risk-assessment`, `juridische-brief`, `zoekvraag-onderzoek` (de goedkope eerste Wft-filter op onderwerpkeuze), `ai-gedrag` (prompt-DNA passeert deze poort vóór `brand-review`).
