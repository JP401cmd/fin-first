# Oordeel — gebruiksvriendelijkheid & de weergavemodus Eenvoudig/Volledig

*24 augustus 2026 · na tien testrondes (84 bevindingen) plus een gerichte
vergelijkingsronde Eenvoudig ⇄ Volledig op desktop en mobiel (account jochen@,
persona Lisa). Aanleiding: terugkerende testerfeedback "de app is te moeilijk";
de eenvoudige weergave moet dat verhelpen.*

## Metingen van vandaag

| | Volledig | Eenvoudig |
|---|---|---|
| /overzicht mobiel (390×844) | **5,8 schermen** | **2,4 schermen** |
| /overzicht mobiel, tekstomvang | 2.567 tekens | 1.401 tekens |
| Eerste mobiele scherm | volledig gevuld door welkomstgids + Fin-toast, géén financieel getal | begroeting + 4 kerngetallen zichtbaar |
| /toekomst zijbalk | 6 sub-items | 4 (Rekenhulp/Wat-Als verborgen) |
| /overzicht/belasting boven de vouw | identiek | identiek — inclusief het foute marginale tarief (C9) |

Geïmplementeerd van de besluiten van 9 aug: weergavekeuze als eerste blok op
/mijn/uiterlijk, ontdek-voetregels in béíde richtingen, gecomprimeerde
welkomstgids in Eenvoudig, ⌘K-copy gerepareerd, nav-snoei. Default 'simple'
voor nieuwe accounts; alle geseede testaccounts stonden vandaag op 'full' —
de 84 bevindingen zijn dus vrijwel volledig in Volledig verzameld.

## Hoofdoordeel

**"Te moeilijk" heeft hier drie oorzaken, en de weergavemodus adresseert er
maar één — de minst fundamentele.**

1. **Getallen die elkaar tegenspreken** (de grootste). C1 (antwoord verschilt
   per laadbeurt), C8/C9 (twee heffingen, onmogelijk tarief), C10 (13 jaar
   verschil in het FIRE-antwoord), H4–H7, H21, vier dagtarieven (M22/L10).
   Een gebruiker die twee schermen niet op elkaar krijgt concludeert niet "de
   app is stuk" maar "ik snap het niet" — en meldt "te moeilijk". Dit is niet
   met verbergen op te lossen, alleen met single-sourcing.
2. **Te veel tegelijk, en vragen vóór antwoorden.** H20 (ruim twintig blokken),
   M1 (checklist kent de data niet), H17 (toast over de content), vier
   inboxen. Hier helpt Eenvoudig aantoonbaar.
3. **Taal op beslismomenten.** H19 (jargon), H27 (beheerderstaal in een
   foutmelding), C2 (label zegt het omgekeerde). Deels gedekt door de
   jargonregel (APP-5), niet afgedwongen.

## Oordeel over het mechanisme zelf

**Concept 7/10, uitvoering tegen het doel "beginner ontlasten" 5/10.**

Wat goed is: technisch de juiste keuzes (server-side, cross-device, één bron,
geen drift), meetbaar effect op mobiel, ontdekbaarheid in beide richtingen
gerepareerd, default simple voor nieuwe accounts.

Waar het zijn doel mist:

1. **Eenvoudig verwijdert de uitleg en houdt de getallen.** De hefboomtegels
   verliezen in Eenvoudig juist hun duiding ("Goed gespreid", "Hoge
   schuldenlast") en houden de kale euro's. Beginners hebben méér aan woorden
   dan aan getallen; experts andersom. De reductie mikt op volume, niet op
   begrijpelijkheid — precies verkeerd om.
2. **De drie aandachtsvreters blijven staan.** De welkomstgids staat ook in
   Eenvoudig bóven de begroeting en toont 0/4 afgevinkt op een account met 16
   bezittingen; de Fin-toast dekt in beide modi content af; de badge ·9 trekt.
   Het allereerste dat de app tegen een beginner zegt is een takenlijst met
   dingen die al gedaan zijn.
3. **Eenvoudig kan incoherentie niet verbergen — en maakt haar gevaarlijker.**
   De belasting-hub is boven de vouw identiek, inclusief 36,6% effectief naast
   35,8% marginaal. En wie in Eenvoudig één getal ziet, heeft mínder context om
   een fout getal te ontmaskeren. Vertrouwen in het enige getoonde getal stijgt;
   de juistheid ervan niet.
4. **De keuze is binair en app-breed.** Wie één onderwerp diepte wil (Lisa:
   belasting) moet app-breed naar Volledig — en is terug bij de overweldiging.
   DepthSection (inklappen-met-behoud, het oorspronkelijke ADR 0026-idee) wordt
   nauwelijks gebruikt (8 bestanden tegenover 21 hard-hides); een "toon meer"
   ter plekke bestaat niet. De escalatieroute is een instellingenpagina — een
   contextwissel in plaats van een ontdekking.

## Aanbevelingen, gerangschikt

1. **Coherentie vóór reductie.** Single-source de vijf kerngetallen
   (vrijheidsleeftijd/-datum, FIRE-voortgang+grondslag, dagtarief, marginaal
   tarief, box 1-heffing). Zolang die vloeien, maakt élke weergavemodus de
   app "moeilijk".
2. **Richt Eenvoudig op begrip, niet op volume.** Duiding blijft, detail
   verdwijnt: tegel = naam + oordeel in gewone taal (+ evt. vrijheidstijd),
   het euro-detail één tik verder. Dwing de jargonregel af met een test.
3. **Checklist data-bewust en ónder de begroeting; toast begrenzen.** De
   eerste seconde moet antwoorden ("je staat er zo voor"), niet vragen.
4. **Van binaire schakelaar naar diepte ter plekke.** Gebruik DepthSection
   zoals bedoeld: in Eenvoudig per sectie "Toon meer →" die onthoudt wat de
   gebruiker opende. Groei van beginner naar gevorderd hoort geleidelijke
   ontdekking te zijn, geen instellingen-flip.
5. **Laat de eerste sessie eindigen bij het antwoord.** Onboarding in
   Eenvoudig sluit af op het vrijheidsgetal met één zin duiding — de belofte
   van de landingspagina ("eerste Vrijheidsrapport in 5 minuten") waargemaakt.

## Kanttekening bij het bewijs

De 84 bevindingen zijn vrijwel volledig in Volledig verzameld (alle geseede
accounts stonden op 'full'). Een deel van de overweldigingsbevindingen weegt
in Eenvoudig lichter; de kernbevindingen (C1, C8–C10, H4–H7) zijn in Eenvoudig
onverminderd zichtbaar. Toekomstige rondes: ten minste één tester expliciet in
Eenvoudig laten draaien.
