---
id: 0182-koppelingen-bijwerken-bij-openen
title: 'Bank- en brokerkoppelingen werken zichzelf bij bij het openen van Overzicht'
status: aanvaard
date: 2026-09-27
elements: [t-bankconnect, ext-brokers, as-budget, as-vermogen]
---

# 0182 — Bank- en brokerkoppelingen werken zichzelf bij bij het openen van Overzicht

Opent iemand /overzicht, dan werkt de app op de achtergrond elke bank- of brokerkoppeling bij die langer dan twaalf uur niet gesynchroniseerd is. Dat gaat via de bestaande sync-routes, in de sessie van de gebruiker. Een globale schakelaar "Automatisch bijwerken" op /mijn/koppelingen (`profiles.auto_sync_enabled`, standaard aan) zet het uit.

## Aanleiding

Melding W-018: "Overweeg een cronjob voor het syncen van gegevens voor gebruikers. Keuze voor gebruikers?" Crypto (exchanges en wallets) liep al elke dag mee in de avond-cron. Bank (TrueLayer) en brokers (Trading 212) synchroniseerden alleen op een knop, plus de eerste ophaal na de onboarding (ADR 0158). Wie de app een week niet opende, zag verouderde saldi en transacties.

## Besluit (eigenaar, 27 sep 2026 — optie A plus schakelaar)

1. **Bijwerken bij openen, geen cron.** Na de eerste paint (4 s: de rondleiding en de eerste ophaal van ADR 0158 gaan voor) haalt `components/sync/automatisch-bijwerken.tsx` de bankkoppelingen vers op en start `triggerGlobalSync` voor wat ouder is dan `AUTO_SYNC_STALE_MS` (12 u). De gebruiker is erbij, dus het is een gewone "attended" ophaal: geen service-role, geen onbewaakt PSD2-verzoek, geen nieuw pad naar de bank.
2. **Wat nooit vanzelf meegaat.** Een koppeling die nog nooit synchroniseerde (het correctiemoment van ADR 0069 blijft dicht bij de gebruiker; de eerste ophaal is van ADR 0158). Een kapotte of dragerloze bankkoppeling, en een broker waarvan de sleutel niet meer werkt (ongeldig of zonder leesrechten, `lib/integrations/broker-error-messages.ts`): een poging heeft daar geen kans en zou bij elk bezoek dezelfde rode melding geven. Een tijdelijke brokerfout (rem, netwerk) blokkeert niet. Een bank die vandaag al twee verzoeken kostte (`AUTO_SYNC_MAX_DAILY_REQUESTS`): `last_synced_at` beweegt niet bij een mislukte sync en de sessiestempel is na een herlaad weg, dus de dagteller is het enige duurzame teken. Exchanges en wallets: die heeft de avond-cron al.
3. **Remmen tegen dubbel werk.** Per tabblad hooguit één blik per uur (module-scope). Per apparaat één ronde per uur, via een claim in `localStorage` die per account gescoped is en binnen een Web Lock (`navigator.locks`) wordt genomen, zodat claimen en starten over tabbladen heen atomair zijn. Loopt er al een ronde (knop, eerste ophaal), dan wacht de trigger tot die klaar is; kwam hij er toch niet door, dan geeft hij de claim terug. En het serverfeit: `last_synced_at` wordt per ronde vers gelezen en de bank-route bewaakt de dagrem atomair in de database. De bank-import is idempotent (unieke index op `import_hash`); de broker-import is dat alleen na elkaar, niet gelijktijdig (zie Gevolgen).
4. **Zichtbaar.** De ronde loopt via `triggerGlobalSync`, dus met de voortgangsstrip, een melding per bankkoppeling, een foutmelding per broker met de weg naar /mijn/koppelingen, en een `router.refresh()`. Brokers zijn daarvoor een vijfde job-soort (`'broker'`) in `lib/sync/global-sync.ts`, zonder stille herhaling (Trading 212 remt per API-key). De prijsstap staat in deze ronde uit: die schrijft een vermogenspunt met bron "manual" dat de gebruiker niet vroeg.
5. **De schakelaar.** Eén scalar boolean op `profiles`, standaard `true`. Motivering: het doet niets wat de gebruiker niet met één klik zelf doet, hij koppelde juist om niet zelf bij te houden, en de keuze is volledig omkeerbaar. Lezen via de loader (`getOwnProfile`), schrijven via `PUT /api/auto-sync` (zod, error-envelope, own-row). **Fail-closed**: alleen een expliciete `true` start iets. Zolang de migratie niet is toegepast bestaat de kolom niet en slaapt de functie.

## Bewust niet (nu)

- **Optie B, een nachtelijke bank-cron.** Service-role, tokenrotatie, PSD2-unattended-limieten, faalmeldingen, /privacy-tekst. Pas na het TrueLayer-P1-spoor (W-014) en met een eigenaarsbesluit.
- **Optie C, brokers in de avond-cron.** Niet klein: de cron draait met service-role over alle gebruikers en zou voor brokers de versleutelde API-key ontsleutelen buiten een sessie. Dat is een nieuw service-role-pad met eigen security-run; A dekt de wens zolang de gebruiker de app opent. Een broker-cron vraagt bovendien eerst de server-lease hieronder.
- **Per koppeling kiezen.** Pas als daar vraag naar is (dan een kolom op de koppeltabellen, via schemawijziging).

## Gevolgen

- Een bankkoppeling kost hooguit twee automatische dagtikken per dag, ook als de sync telkens mislukt; ruim binnen de reserve van de handmatige knop.
- **Restrisico broker-gelijktijdigheid.** `lib/integrations/broker-sync.ts` leest en schrijft posities zonder unieke index op `investment_holdings`. Na elkaar is dat veilig (units worden vervangen, de assetwaarde herleid); twee gelijktijdige syncs van dezelfde koppeling kunnen een nieuwe positie dubbel wegschrijven. Het Web Lock sluit dat tussen tabbladen met automatisch bijwerken af, maar niet tegen een handmatige klik op /mijn/koppelingen in precies dezelfde seconden (en niet in een browser zonder Web Locks). Dat gat bestond al tussen twee handmatige klikken in twee tabbladen. De echte oplossing is een server-lease op `broker_connections` (`sync_started_at`, 409 bij een lopende sync) of een unieke index, via /schemawijziging; staat als vervolg genoteerd.
- De eerste ophaal van ADR 0158 start eerder (2 s tegen 4 s) en de trigger wacht op een lopende ronde, zodat die twee elkaar niet verdringen.
- De claim-sleutel draagt de user-id en wordt bij een accountwissel opgeruimd (`lib/browser-account-storage.ts`).
- Door de default `true` staat het na het toepassen van de migratie voor iedereen aan. Doel en grondslag van de bankverwerking veranderen niet (de toestemming bij het koppelen), alleen de frequentie: hooguit twee keer per dag en alleen als de app open is. Een zin daarover op /privacy is optioneel en loopt dan via de Grenswachter-route.
