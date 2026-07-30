# Live testplan — welke scenario's zijn met chromedev te testen?

> Doel: de live-run gericht maken. Niet alle 26 scenario's uit `scenarios.md` zijn
> met een browser af te dwingen — sommige vragen een tweede bank, een verlopen
> autorisatie of een gelijktijdige tweede sessie. Dit document zegt per scenario
> **hoe** je hem live krijgt, of **waarom niet** en wat het alternatief is.
>
> Opgesteld 30 juli 2026, vóór de live-run. De TrueLayer-omgeving staat op
> productie (`truelayer_environment = production`) met een echte Rabobank-koppeling
> — elke koppelpoging in dit plan is dus een échte autorisatie, geen sandbox.

## Randvoorwaarden vooraf

1. **De provider-limiet is een harde rem.** Rabobank gaf op 29 juli
   `provider_request_limit_exceeded` na een handvol historische ophaalvragen. Plan
   niet meer dan één koppeling + één sync per testronde, en spreid ze.
2. **Onze eigen rem is 10 synchronisaties per dag per rekening** — genoeg, maar
   niet oneindig. SC-17 (rate-limit) verbrandt die bewust; doe die als laatste.
3. **Twee testaccounts beschikbaar**: `jpsmit@jps-holding.nl` (hoofdaccount, rekening
   met historie sinds 2018) en `janpaul050486@gmail.com` (tweede account, gekoppelde
   Rabobank). Dat maakt de partner-/gedeelde-rekening-scenario's mogelijk zonder
   een derde persoon.
4. **Er staat een lege testrekening "TL"** (€1, nul transacties) op het hoofdaccount.
   Bewust laten staan (eigenaarsbesluit) — herken hem als ruis, niet als bevinding.

## Groep 1 — Direct live te testen (10)

Deze doorloop je gewoon in de browser; ze vragen niets bijzonders.

| # | Scenario | Hoe |
|---|---|---|
| SC-01 | Koppelen aan lege bestaande rekening | Maak een lege rekening, kies 'm in stap 2 |
| SC-03 | Koppelen aan nieuwe rekening | Kies "Nieuwe rekening aanmaken" |
| SC-06 | Doelrekening heeft al een actieve koppeling | Kies de al-gekoppelde rekening → verwacht een geblokkeerde optie mét pad naar ontkoppelen |
| SC-09 | Gebruiker breekt de bankautorisatie af | Start, klik weg bij de bank |
| SC-12 | Verbinding kwijt → herstellen vanaf de rekening | Zie groep 3 voor het forceren van de toestand |
| SC-15 | Verbinding verbreken | Verbreek en controleer dat rekening + transacties blijven |
| SC-19 | CSV bijladen zonder overlap | Importeer een CSV met alleen oudere data |
| SC-20 | CSV bijladen mét overlap | Importeer een CSV die de bankperiode overlapt → verwacht voorgedeselecteerde rijen mét reden |
| SC-22 | Budgetteren bij een rekening die dat uit had | Zet budgetteren uit op een rekening, koppel 'm |
| SC-25 | Koppelen tijdens onboarding | Nieuw account, koppel in de onboarding-flow |

## Groep 2 — Live te testen, maar de uitgangssituatie moet je maken (6)

Deze kunnen wél, maar vragen eerst een ingreep in de data of een tweede account.

| # | Scenario | Wat je eerst moet doen |
|---|---|---|
| SC-02 | Koppelen aan rekening mét CSV-historie | Gebruik de rekening met 7.975 transacties op het hoofdaccount |
| SC-13 | Gedeactiveerde-rekening-reconnect | "Verwijder" een gekoppelde rekening in de UI (= deactiveren), koppel opnieuw → **de bug van 29 juli**; verwacht nu zichtbaar én mét budgettracking terug |
| SC-14 | Rekening later aan een ándere bank koppelen | Vraagt een tweede bank; alleen te doen als je een tweede bankrelatie hebt |
| SC-23 | Budget-toewijzingen blijven staan | Zet met de hand een budget op een paar transacties, sync opnieuw |
| SC-24 | Banksaldo overschrijft handmatig saldo | Zet met de hand een afwijkend saldo, sync → verwacht de melding "saldo overgenomen: €a → €b" én een spoor in de vermogenshistorie |
| SC-17 | Dagelijkse rate-limit bereikt | 10× synchroniseren op één rekening. **Als laatste doen** — dit blokkeert die rekening voor de rest van de dag |

## Groep 3 — Alleen via een database-ingreep te forceren (5)

De toestand is in de browser niet af te dwingen; met gerichte SQL wél. Doe dit op
het **tweede** account, niet op het hoofdaccount met echte historie.

| # | Scenario | Ingreep |
|---|---|---|
| SC-10 | Herautorisatie na 90 dagen | Zet `bank_connections.token_expires_at` in het verleden |
| SC-11 | Verbinding ingetrokken bij de bank | Zet `status = 'revoked'`. **Let op:** geen enkel codepad schrijft die waarde ooit — dit toetst dus alleen dat de UI 'm als "verbinding kwijt" leest, zoals besloten |
| SC-12 | Verbinding kwijt (indicator + herstelknop) | Idem SC-10; controleer dat het icoon omslaat en de herstelknop verschijnt |
| SC-16 | Periode waarin de bank niets teruggeeft | Zet `sync_cursor` op vandaag, sync → verwacht een nette "niets nieuws"-melding |
| SC-18 | Token-decryptie mislukt (legacy-rij) | Zet `access_token_encrypted` op een onleesbare waarde → verwacht "verbind opnieuw", geen 500 |

## Groep 4 — Niet zinvol live te testen (5)

Hier is een browsertest zwakker dan wat er al ligt; de dekking zit elders.

| # | Scenario | Waarom niet, en waar de dekking zit |
|---|---|---|
| SC-04 | Eén consent, meerdere bankrekeningen | Rabobank levert er één. Vraagt een bank die er meerdere teruggeeft; gedekt door de callback-tests op de precedentieketen |
| SC-05 | Spaarrekening/creditcard komt mee | Idem — geen tweede rekeningtype beschikbaar in deze consent; gedekt door de `mapAccountType`-tests |
| SC-07 | Niet-gekozen rekening matcht een bestaande | Volgt uit SC-04; zelfde beperking |
| SC-08 | Dubbelklik op "Verbind" | Een race is in een handmatige klik niet betrouwbaar te reproduceren; sinds fase 6 dwingt de database het af (unieke index) en dát is met SQL te bewijzen |
| SC-26 | Twee syncs tegelijk (race) | Idem: niet handmatig af te dwingen. De TOCTOU op de dagteller staat bewust als openstaand restrisico |
| SC-21 | Cross-bron dedup faalt stil | Per definitie niet waarneembaar in een UI — dat ís het restrisico. Meetbaar via de gesplitste tellers in `bank_sync_log`, niet via een scherm |

## Volgorde voor de run

1. Groep 1 in één sessie (geen data-ingrepen nodig).
2. Groep 2 daarna, behalve SC-17.
3. Groep 3 op het tweede account, met de SQL erbij.
4. SC-17 als allerlaatste — die verbrandt de dagteller.

Reserveer na elke koppeling een pauze in verband met de provider-limiet; loopt die
vol, dan is dat zélf een geldige waarneming voor SC-17's zusterscenario (de
`provider_request_limit_exceeded`-afhandeling uit fase 1).
