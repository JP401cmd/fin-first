# Requirements: Gids Pagina Herinrichting

## Samenvatting

De TriFinity gids (`/identity/gids`) wordt getransformeerd van een 19-accordion naslagwerk naar een inspirerende reis-ervaring. De "Je reis"-stappen worden het hart van de pagina, met daarin geneste onderdelen die elk twee niveaus hebben: een korte waarde-beschrijving en een "Hoe werkt het?"-dropdown met instructies.

## Probleem

1. De huidige pagina heeft een identiteitscrisis — ze is tegelijk onboarding-wizard, feature-encyclopedie en ontdekkingsmotor
2. 19 platte accordions lezen als een softwarehandleiding
3. Slechts één accordion kan tegelijk open (single state)
4. "Je reis" (het sterkste deel) wordt begraven tussen abstracte concepten en een accordionmuur
5. Twee inconsistente stemmen: motiverend in reis-kaarten, droog in accordions
6. Geen visuele hulpmiddelen (screenshots, schema's)
7. Drie lege "Overig — binnenkort meer" placeholders
8. Veel gebouwde features ontbreken volledig in de gids

## Acceptatiecriteria

### Structuur
- [ ] De pagina volgt de nieuwe flow: Hero → Voortgangsbalk → Je Reis (5 stappen) → Concepten → Overal → FAQ → Ontdekken → Pro Tips
- [ ] "De onderdelen" als platte sectie met 19 accordions is verwijderd
- [ ] Onderdelen zijn genest binnen de 5 reis-stappen
- [ ] Elk onderwerp heeft twee niveaus: beschrijving + "Hoe werkt het?" dropdown
- [ ] Drie "Overig — binnenkort meer" placeholders zijn verwijderd
- [ ] Voortgangsbalk is klikbaar en scrollt naar de bijbehorende reis-stap
- [ ] Meerdere onderwerpen kunnen tegelijk open staan

### Content
- [ ] Alle teksten zijn geschreven in de "waarde-eerst" toon
- [ ] Elke "Hoe werkt het?" bevat genummerde stappen + optionele tip
- [ ] Alle bestaande app-features zijn gedekt (13 asset types, 11 debt types, etc.)
- [ ] Content is in het Nederlands

### Componenten
- [ ] ReisStapSection: uitgebreide reis-kaart met geneste onderdelen
- [ ] GuideTopicCard: twee-niveaus component (beschrijving + dropdown)
- [ ] GuideHowTo: genummerde instructie-stappen
- [ ] Bestaande componenten behouden: ConceptFlipCards, GuideProgressBar, GuideFaq, GuideProTips, OntdekkenSection

### UX
- [ ] Responsive (mobile-first, lg breakpoint voor grid)
- [ ] Touch targets minimaal 44px
- [ ] Smooth scroll bij klikken op voortgangsbalk-segmenten
- [ ] Animatie bij openen/sluiten van dropdowns
- [ ] Module-kleuren consistent (kern/wil/horizon)

## Niet in scope
- Screenshots/illustraties toevoegen (toekomstige verbetering)
- Soevereiniteitsniveau-gating van content (toekomstige verbetering)
- Zoekfunctionaliteit (toekomstige verbetering)
- Wijzigingen aan bestaande componenten (ConceptFlipCards, GuideFaq, etc.)
