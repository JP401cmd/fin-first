---
id: 0115-pensioen-import-blijft-op-het-toestel
title: De pensioen-datadownload wordt client-side gelezen en geschreven — bewuste afwijking van ADR 0058
status: aanvaard
date: 2026-08-29
elements: [as-import, as-planning, sp-plannen, app-comp, data-cont]
---

De XML- en JSON-download van mijnpensioenoverzicht.nl wordt volledig in de browser gelezen, gemapt en weggeschreven — het bestand verlaat het toestel niet en er is geen `POST /api/pension/import`. Dat is een bewuste, begrensde afwijking van de datapad-conventie uit ADR 0058 ("muteren via een API-route"), gemotiveerd door de privacybelofte die de app op dit oppervlak letterlijk uitspreekt. De afwijking geldt uitsluitend voor het lezen van het gedownloade bestand en het schrijven van de daaruit volgende `life_events`; alles daaromheen blijft ongewijzigd.

## Context

Een pensioenoverzicht is het gevoeligste document dat de app aanraakt: het koppelt een BSN-persoon aan zijn volledige tweede-pijler-opbouw per uitvoerder. Precies daarom presenteert de UI de datadownload als de *aanbevolen* route naast de PDF, met de toezegging dat we die "zonder AI, volledig op je eigen apparaat" verwerken. Die belofte is het verschil tussen de twee routes; ze is de reden dat een gebruiker die de AI-route niet vertrouwt tóch kan importeren.

De datadownload bestaat in twee serialisaties van één datamodel (`Specificatie-xml-json-download-v1.2`): `pensioenaanspraken.xml` — het bestand dat de publieke downloadknop daadwerkelijk levert — en JSON. Het JSON-pad landde in augustus 2026 al client-side; met de XML-adapter (`lib/pension/mijnpensioen-xml.ts`) komt dezelfde vraag scherper te liggen, omdat XML nu het hoofdformaat wordt.

Het alternatief was het hele pensioen-importpad naar een serverroute te brengen (ADR 0058 + 0044, met zod, error-envelope en drift-logging via `recordContractEvent`, ADR 0024). Dat is technisch de nettere plaat — en het kost precies de belofte hierboven: het pensioenoverzicht zou dan alsnog het toestel verlaten.

## Besluit

Het lezen én schrijven van de pensioen-datadownload blijft client-side.

- `lib/pension/mijnpensioen-xml.ts` en `-json.ts` draaien in de browser; het bestand wordt niet geüpload en niet in storage bewaard (dat pad blijft bewust alleen voor de PDF).
- De write loopt via de anon-RLS-client onder `.eq('user_id', userId)`, nooit via service-role, en nooit zonder dat de gebruiker per pot `add`/`update`/`skip` heeft bevestigd.
- De afwijking is strikt begrensd tot dit pad. Nieuwe mutaties elders volgen ADR 0058 ongewijzigd; de PDF-route via `/api/pension/parse` blijft zoals hij is.

De vijf importtoetsen blijven gelden, met één expliciet verantwoorde uitzondering:

1. **Expliciet doel** — de gebruiker kiest per pot; AOW is een aparte keuze.
2. **Sleutel server-bepaald** — *hier niet haalbaar en bewust anders*: de dedup-sleutel is de genormaliseerde fondsnaam (`normalizePensionFondsNaam`, `metadata.mijnpensioenBron`), client-side afgeleid. Verdedigbaar omdat er geen tweede schrijver is, geen unieke index, en de gebruiker elke rij bevestigt. De sleutel is wél **deterministisch en serialisatie-onafhankelijk**; dat is de eigenschap die de idempotentie draagt en die in `mijnpensioen-xml.test.ts` wordt vastgepind.
3. **Afgeleide getallen herleiden** — `applyPensionPots` schrijft bij `update` absolute waarden en telt nergens op.
4. **Scoping volgt eigenaarschap** — eigen rij, `ownership='personal'`; een geïmporteerde pot lekt niet naar de partner.
5. **Zichtbare terugkoppeling** — het reviewpaneel toont per pot de actie plus `updated/inserted/skipped`.

## Gevolgen

- De privacybelofte op dit oppervlak is waar en blijft waar; de datadownload is een volwaardig alternatief voor wie de AI-route niet wil.
- **Prijs: geen drift-detectie.** `recordContractEvent` (ADR 0024) is een service-role-RPC en kan vanaf de client niet worden aangeroepen. Wijzigt het pensioenregister zijn datamodel, dan levert de import stil nul potten en horen wij daar niets van. Compenserende maatregel: het bron-contract staat nu expliciet in `lib/parsers/format-contracts.ts` (`pension-mijnpensioen`) naast de `REPEATABLE_NODES`/`TEXT_ONLY_FIELDS` in de XML-adapter, zodat de knoopnamen op één plek te controleren zijn. Wordt stille drift een reëel probleem, dan is een *tellings-only* signaal (aantal potten, zonder bedragen of namen) de kleinste stap die de belofte niet breekt — niet het uploaden van het bestand.
- De `check:client-reads`-gate blijft van toepassing op de rest van de app; dit pad is een gedocumenteerde uitzondering, geen precedent voor nieuwe client-writes.
- Blijft staan als openstaand punt (buiten deze ADR): het onboarding-pad schrijft via de blinde wrapper `applyPensionParseResult` alles als `add`, zonder reconcile — een tweede doorloop verdubbelt daar de potten.
