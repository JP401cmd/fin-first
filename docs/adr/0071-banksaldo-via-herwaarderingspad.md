---
id: 0071-banksaldo-via-herwaarderingspad
title: 'Bank-saldosync via het canonieke herwaarderingspad — géén "niet overschrijven"-vlag'
status: aanvaard
date: 2026-07-30
elements: [t-bankconnect, as-vermogen]
---

# 0071 — Bank-saldosync via het canonieke herwaarderingspad

Fase 8 van `specs/bank-connect-doelrekening/plan.md` (§6, FR8) — geschreven bij
fase 9 op eigenaarsbesluit (30 juli 2026: de inhoud moest wachten tot fase 8
was uitgevoerd).

## Context

`lib/truelayer/balance-sync.ts` schreef `bank_accounts.balance` en
`assets.current_value` en liet daarna geen spoor na: het netto vermogen
verspringt, maar de herwaarderingshistorie en de sparkline weten niet waarom.
Dat is inconsistent met elke andere weg waarlangs `assets.current_value`
verandert — een handmatige herwaardering schrijft altijd een `valuations`-rij
plus de `balance_snapshots`-mirror, en ADR 0046 leest de historische
verloop-banden uitsluitend uit `balance_snapshots`. Vóór dit besluit schoof
een banksync daar dus stil doorheen.

## Besluit

**Elke `assets.current_value`-wijziging die uit een banksync komt, levert een
`valuations`-rij plus de `balance_snapshots`-mirror.** Zelfde twee
schrijfacties als de live herwaardering en de entiteit-backfill
(`lib/truelayer/balance-valuation.ts#recordBankBalanceRevaluation`). Ongewijzigd
saldo schrijft **niets** — anders vult elke routine-sync de
herwaarderingshistorie met ruis.

**Geen "niet overschrijven"-vlag.** Een vlag die een banksync zou laten
overslaan bij een eerdere handmatige waardering is verworpen: dat zou een
tweede waarheid voor hetzelfde getal worden, plus een nieuw gating-begrip dat
elke lezer moet kennen. De banksync wint gewoon, net als elke andere
herwaardering-op-dezelfde-dag dat al deed.

**De vorige waarde reist mee ín de waarderingsrij, niet via een nieuwe kolom
en niet via de client.** Het correctiemoment (`POST /api/bank-connect/relink`)
moet een verkeerd geland saldo kunnen terugdraaien, maar draait in een ándere
request dan de callback die het saldo schreef; op dat moment is de oude waarde
nergens anders meer te vinden — de dag-upsert op `valuations` kan een
handmatige herwaardering van diezelfde dag al vervangen hebben. Drie
alternatieven zijn expliciet afgewezen: een kolom op
`bank_connection_accounts` (transiënte toestand in een relationele tabel), het
bedrag via de redirect-URL (bedragen in browserhistorie en serverlogs), en een
client-aangeleverd "vorige saldo" (een feit dat de database al draagt uit de
client laten komen — zie ADR 0075). Gekozen: de waarderingsrij legt in `notes`
vast wát ze verving, machine-leesbaar en met een geankerde marker
(`bank-sync · vorige waarde <bedrag>` / `bank-sync-correctie · vorige waarde
<bedrag>`), geschreven én gelezen door precies één module.

**Het correctiemoment compenseert append-only, nooit met een delete.** Een
verkeerd geland saldo wordt teruggedraaid met een COMPENSERENDE waardering,
niet door de foute rij te verwijderen — het grootboek blijft een volledig
audit-spoor. De compensatie schrijft de bezitting EERST en de markering
LAATST (omgekeerd van de normale volgorde): de correctie-notitie is óók de
idempotentie-poort, dus als de markering voorop stond en de bezitting-write
daarna faalde, zou een herhaling de correctie als laatste waardering lezen,
`null` teruggeven, en de toestand — grootboek hersteld, `assets.current_value`
nog op het oude banksaldo — niet meer zelf kunnen herstellen. Met de bezitting
eerst convergeert elke herhaling.

**De regel voor `valuations.notes`: nooit een beslissing dragen die verder
reikt dan de eigen rijen van de schrijver.** De kolom is een
machine-leesbaar besturingssignaal in een kolom die de gebruiker zelf kan
beschrijven (dezelfde dag-conflictsleutel als de handmatige
herwaarderingssheet). Geen rechtenwinst — alles wat een vervalste notitie kan
bereiken mag de gebruiker toch al direct op zijn eigen rijen — maar élke
volgende lezer van deze notitie moet dat zelf opnieuw toetsen voordat hij er
iets op baseert.

## Alternatieven

- **Een "niet overschrijven"-vlag bij een bestaande handmatige waardering** —
  verworpen, zie hierboven: tweede waarheid + nieuw gating-begrip.
- **Het vorige saldo via de client laten meesturen** — verworpen: een feit dat
  de database al draagt hoort niet uit de client te komen (ADR 0075).
- **Het vorige saldo via de redirect-URL** — verworpen: bedragen belanden dan
  in browserhistorie en serverlogs.

## Gevolgen

- `syncAccountBalance` schrijft in de volgorde grootboek → bezitting →
  bankrekening, en scopet élke ronde expliciet op `user_id`: RLS scopet de
  RIJ, niet de WAARDE van `bank_accounts.linked_asset_id` daarop, en de
  SELECT-policy op `bank_accounts`/`assets`/`valuations` is breder dan
  eigen-rij (huishoud-gedeeld) — zonder de filter kon een naar een gedeelde
  partnerbezitting gezette FK een `valuations`-/`balance_snapshots`-rij onder
  de verkeerde eigenaar laten landen.
- De melding op de success-pagina ("saldo overgenomen: €a → €b") komt uit het
  grootboek (`GET /api/bank-connect/linked-accounts`), niet uit de
  sync-respons alleen — de callback schrijft het saldo vóórdat de
  success-pagina laadt en heeft dus geen respons om op mee te liften. De
  pagina herhaalt de cent-vergelijking niet zelf.
- `valuations` heeft een UNIQUE `(entity_id, valuation_date)` zónder
  `user_id` en geen FK op `entity_id` — pre-existent, maar deze sync maakt het
  voor het eerst een faalpunt in een schrijfpad (een cross-user rij op
  dezelfde dag laat de upsert op de RLS-check stuklopen in plaats van te
  mergen). Eigen vervolgpunt, `supabase-db-specialist`.
- `bankSyncValuationDate()` gebruikt UTC-dag (`toISOString().split('T')[0]`),
  gelijk aan de bestaande live herwaardering — tussen 00:00 en 02:00
  Nederlandse tijd hoort een sync daardoor bij de kalenderdag ervóór. Bewust
  niet apart opgelost: een tweede dag-definitie naast de bestaande zou erger
  zijn dan de huidige, gedeelde onnauwkeurigheid.
