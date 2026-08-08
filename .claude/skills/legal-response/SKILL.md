---
name: legal-response
description: Gebruik voor het schrijven van het antwoord aan iemand van buiten met een juridisch getinte vraag, klacht of verzoek — een inzage- of verwijderverzoek, een klacht over een verkeerd getal, een vraag of wij advies geven, een melding van een beveiligingsonderzoeker. Levert de tekst; de afhandeling zelf loopt via de bestaande procedures en API's.
---

# Legal-response — de tekst naar buiten

**Eerste regel — deze skill levert de tékst, nooit een tweede proces.** De machinerie bestaat al: een inzage-, export- of verwijderverzoek loopt via `avg-verzoek` en de bestaande API's (`/api/account/export`, `/api/account/delete`); een lek via `datalek-72u`; een storing via `incidentprotocol`. Start hier dus nooit een parallelle afhandeling — zoek eerst de procedure, schrijf dan het antwoord.

## Volgorde

1. **Klok eerst, tekst daarna.** Een AVG-verzoek start de 30-dagenklok bij ontvangst, een lek de 72-uursklok. Registreer dat vóór je gaat schrijven — een mooi antwoord op dag 31 is te laat.
2. **Bepaal wie er schrijft.** Standaardgeval → deze skill. Nieuwe claimcategorie, dreigend geschil of een toezichthouder → eerst `legal-risk-assessment`, en mogelijk een jurist.
3. **Schrijf het antwoord** volgens de vorm hieronder.
4. **Leg de verzonden tekst vast** bij de aantekening in Notion. Wat we geantwoord hebben, is later net zo relevant als wat we gedaan hebben.

## De vorm

- **Bevestig eerst wat je begrepen hebt**, in hun woorden. Geen defensieve opening.
- **Zeg wat we doen en wanneer.** Een concrete datum of termijn, geen "zo spoedig mogelijk".
- **Leg een beperking uit in plaats van hem te verzwijgen.** Blijft er bij verwijdering iets bewaard op grond van een bewaarplicht, benoem wát en op welke grond — dat is een uitzondering, geen weigering.
- **Beloof niets buiten de procedure.** Geen coulance, korting of uitzondering toezeggen zonder dat de eigenaar dat besloten heeft.
- **Blijf binnen de Wft-grens** (`compliance-check`): wij geven inzicht, geen advies. Een klacht als "jullie hebben mij verkeerd geadviseerd" beantwoord je zonder mee te gaan in het woord advies — en dat is een `legal-risk-assessment`-geval.
- **Toon volgt de merkstem** (`merkstem`): Nederlands, je/jij, kort, geen jargon zonder uitleg, nooit veroordelend.

## Twee valkuilen

- **Het antwoordadres.** TriFinity heeft nog geen werkend juridisch mailadres: `lib/legal-contact.ts` levert bewust een placeholder tot het domein er is. Noem in een antwoord dus nooit een mailbox die geen post ontvangt — antwoord op het kanaal waar het verzoek binnenkwam.
- **Identiteit.** Bij een verzoek over persoonsgegevens antwoord je uitsluitend naar het e-mailadres dat bij het account hoort; vraag nooit extra gegevens (geen kopie-ID) om iemand te identificeren.

## Verwijzing

`org_plan/20-skills.md` §legal-response; rol De Grenswachter (`org_plan/10-rollen.md`). Verwant: `avg-verzoek` (de procedure eronder), `datalek-72u`, `juridische-brief` (als de eigenaar eerst moet kiezen), `compliance-check`, `merkstem`.
