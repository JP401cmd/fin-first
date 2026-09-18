---
id: 0159-de-meldingenrem-vervalt
title: De rem van 5 meldingen per uur vervalt — in de testfase is een dichte meldknop duurder dan misbruik
status: aanvaard
date: 2026-09-18
elements: [as-coach, do-melding, t-supabase]
---

Melden vanuit het gesprek met Fin kende een rem van 5 meldingen per rollend uur per gebruiker, afgedwongen in `public.reserve_user_report_slot`. Die rem raakte in de praktijk de verkeerde persoon: iemand die een scherm systematisch naloopt, loopt er halverwege tegenaan en krijgt een uur lang geen melding meer kwijt. Besluit: de rem gaat er helemaal uit — niet omhoog — en melden is onbegrensd zolang de beta-allowlist de toegang bepaalt.

## Context

De rem stamt uit `20260806161500` en was onderdeel van de derde vindplaats van [ADR 0076](0076-limietcontrole-atomair-in-de-datalaag.md): een limiet die telt-dan-schrijft is geen limiet, dus telling en insert werden onder één advisory lock gezet en de eigen-rij INSERT-policy werd opgeheven. Dat werk deed precies wat het moest doen.

Wat er niet bij stond is waaróm vijf. Het getal is nooit tegen een gemeten gebruikspatroon gelegd; het was een plausibel klinkend plafond tegen misbruik. Tijdens een testronde is het aantoonbaar te laag: op 18 september 2026 liep de eigenaar er tijdens het aanmaken van bugmeldingen tegenaan, met "Je hebt al veel meldingen gestuurd. Probeer het over een uur nog eens." De melding is dan niet uitgesteld maar in de praktijk weg — wie op dat moment een lijst bevindingen doorloopt, gaat niet een uur later terug.

Daar staat tegenover wat de rem beschermde — en dat is minder dan je op het eerste gezicht zou denken. Begrensd werd het aantal rijen in `user_reports` per gebruiker per uur, en daarmee het aantal Notion-kaartjes en het aantal 48-uurs signed URL's dat met zo'n kaartje meegaat. De screenshot-bucket zat er **niet** achter: de route uploadt vóór de reservering, en elke ingelogde gebruiker mag sowieso rechtstreeks in zijn eigen prefix van `user-report-screenshots` schrijven zonder dat daar een melding aan hangt. Die bucket heeft eigen grenzen (privé, 4 MB, png/jpeg/webp, 90 dagen retentie) die onafhankelijk van dit besluit blijven gelden.

Drie opties lagen voor: de rem helemaal weg, de rem fors omhoog (bijvoorbeeld 100 per uur, wat een mens nooit haalt maar een doorgedraaide client wel), of de rem opheffen voor beheerders en laten staan voor gewone testers.

## Besluit

De rem vervalt volledig. `reserve_user_report_slot` telt niet meer, neemt geen advisory lock meer, en geeft `slot_allowed = true` met `slot_used = 0` en `slot_limit = 0` ("geen rem").

Doorslaggevend is wie er vandaag achter de inlog zit: een gesloten beta-allowlist van bekende testers. De rem beschermt tegen een onbekende massa, en die is er niet. Zolang dat zo is, weegt één verloren bevinding zwaarder dan het theoretische misbruik dat de rem tegenhield. Een plafond van 100 zou het probleem óók oplossen, maar houdt een getal in de codebase dat opnieuw nooit ergens aan geijkt is — en een rem die je niet kunt onderbouwen is een rem die je op het verkeerde moment weer in de weg zit. Een uitzondering voor beheerders lost het probleem alleen op voor de eigenaar, terwijl juist de testers de meldingen leveren.

Wat expliciet **niet** verandert:

- `reserve_user_report_slot` blijft het enige insert-pad op `user_reports`; de eigen-rij INSERT-policy komt niet terug. Melder en e-mailadres blijven uit de sessie resp. `auth.users` komen, dus niemand kan op andermans naam melden.
- ADR 0076 blijft onverkort staan. Dat besluit gaat over de *manier* waarop een limiet wordt afgedwongen, niet over de vraag welke limieten moeten bestaan. De twee andere vindplaatsen (`reserve_bank_sync_slot`, `reserve_ai_calculator_slot`) zijn ongemoeid — die beschermen tegen een externe partij, niet tegen onszelf.
- De grenzen die niets met de rem te maken hebben blijven: maximale bestandsgrootte en toegestane MIME-typen, de zod-validatie op de payload, en de CHECK-constraints op de tabel.
- Het onbegrensde upload-pad naar `user-report-screenshots` is een **bewust open restpunt**, geen gevolg van dit besluit — het bestond al en wordt hier niet gedicht. Wie dat wil begrenzen, neemt daar een eigen besluit over.

## Gevolgen

- De 429 `rate_limited` op `POST /api/user-reports` kan in de praktijk niet meer optreden. De route houdt die tak bewust als vangrail: weigert de RPC ooit weer, dan handelt de route dat nog steeds af. Dat maakt een eventuele terugkeer van de rem een zaak van één migratie, zonder route-wijziging.
- De return-vorm `(slot_allowed, slot_used, slot_limit, report)` blijft ongewijzigd. `slot_used`/`slot_limit` dragen geen betekenis meer; ze staan er voor de vorm.
- De acceptatiecriteria rond de meldmodus (`lib/uat/acceptance/will.ts`) beschrijven de rem niet langer als verwacht gedrag.
- De werkelijke prijs van onbegrensd melden is geen geld maar mensenwerk: vervuiling van de drain-queue (het enige beheeroppervlak voor deze meldingen) en een onbegrensd aantal levende 48-uurs signed URL's in die queue. Beide zijn met het allowlist-argument hierboven aanvaard. De retry-cron blijft zelf wél begrensd (50 per run, maximaal 5 pogingen), dus een stortvloed vertaalt zich in achterstand, niet in kosten.
- **Herzien wanneer de allowlist opengaat.** De onderbouwing hierboven hangt volledig aan "de deelnemers zijn bekend". Gaat registratie open voor publiek, dan is dit besluit vervallen en hoort er vóór die stap een rem terug — waarschijnlijk niet op 5, en met een getal dat dán wel ergens aan geijkt is. Signaal dat het eerder misgaat: een ongebruikelijke toeloop van rijen in `user_reports` per gebruiker per uur.
