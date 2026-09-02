---
name: info-knoppen-actueel
description: Houdt de info-knoppen ("Wat zie ik hier?", PageInfoButton) app-breed actueel — detecteert ontbrekende, verweesde of omzeilde PAGE_INFO-content en werkt die standaard direct bij, zonder aparte goedkeuring. Gebruik na het toevoegen/verplaatsen van een pagina of route, als losse controle, of vanuit de release-skill (stap 8).
---

# Info-knoppen actueel houden

**Deze skill is een wegwijzer, geen kopie.** De content zelf staat canoniek in `lib/page-info-content.ts` (`PAGE_INFO`) — schrijf 'm hier nooit over.

**Eerste regel — dit is copy-only, laagrisico werk.** Anders dan `uat-docs-keeper`/`architecture-docs-keeper` (die een test- of architectuurcontract bewaken) heeft `PAGE_INFO` geen downstream-contract: er is geen test die de inhoud van een entry controleert. Deze skill **doet de bijwerking daarom standaard direct** — geen aparte goedkeuringsstap, geen escalatie naar een specialist-agent, tenzij de scope zo groot is dat parallelliseren loont (zie *Grote refresh* hieronder).

## Waar het canoniek staat

| Wat | Canonieke bron |
|---|---|
| Content (INZICHT + GRIP per key) | `lib/page-info-content.ts` — `PAGE_INFO: Record<string, PageInfoContent>` |
| Lookup-helper | `getPageInfo(key, fallbackKey?)` in hetzelfde bestand — nooit rechtstreeks `PAGE_INFO[key]` in een call site |
| Weergave | `components/editorial/page-info-button.tsx` — `ShellOverlay kind="sheet"`, twee kicker-secties |
| Detector | `scripts/page-info/check-coverage.mjs` → `npm run page-info:check` |
| Format- en stemregels | `.claude/skills/ui-ux/SKILL.md` (editorial toon, module-kleur) + `merkstem` (kernbelofte, "geld is opgeslagen tijd") |

## Het format (verplicht per entry)

Elke `PAGE_INFO`-entry is `{ insight: string, grip: string }`:
- **insight** (toont als kicker "INZICHT") — 1-2 zinnen: waarom deze pagina/dit blok ertoe doet. Kanaliseer de belofte *"de vrijheid om met inzicht en grip keuzes te maken voor nu en de toekomst"* zonder 'm letterlijk te herhalen op elke pagina.
- **grip** (toont als kicker "GRIP") — 1-2 zinnen: wat de gebruiker hier concreet kan doen. Acties, geen herhaling van de beschrijving.
- Platte zin(nen), geen bullet-lijstjes, geen markdown. Tweede persoon ("je"). Typografisch apostrof (’) i.p.v. `\'`.
- Noemt de entry een bedrag van betekenis: via `formatWithFreedom`/`lib/format.ts`-conventies in de renderende component, nooit een handmatige dag/jaar-omrekening in de tekst zelf verzinnen.

## Proces

### 1. Detector draaien
`npm run page-info:check` (optioneel `-- --json` voor machine-output). Rapporteert drie categorieën:
- **missing** — een `getPageInfo('key')`/`infoKey="key"`-aanroep zonder bijbehorende `PAGE_INFO`-entry.
- **orphaned** — een `PAGE_INFO`-entry waar niets (statisch zichtbaar) naar verwijst.
- **inlineLiterals** — een `<PageInfoButton content={{ ... }}>` met een object-literal in de JSX zelf, in plaats van via `getPageInfo()`.

**Geen treffers ⇒ één regel "info-knoppen actueel, geen wijziging nodig", klaar.** Dat is de lichtheidsgarantie — dezelfde vorm als `uat:stale`/`arch:diagram`.

### 2. Orphaned-treffers met de hand verifiëren vóór verwijderen
De detector kan geen dynamische `pathname`-lookup volgen (`getPageInfo(pathname, 'fallback')` resolvet de primaire key pas at runtime). Een key die alléén zo bereikt wordt — geen andere letterlijke verwijzing — meldt onterecht als wees (bekend voorbeeld: `/toekomst/whatif`, alleen bereikbaar via de runtime-match in `whatif-header.tsx`). Grep dus altijd eerst op de route zelf (bv. `grep -rn "'/toekomst/whatif'"` en zoek de renderende pagina) vóór je een orphaned-key schrapt. Blijkt de key écht dood (redirect-route zonder eigen pagina, zoals `/core/cash` was): verwijderen.

### 3. Missing en inlineLiterals direct oplossen
- **missing** — schrijf een nieuwe `{insight, grip}`-entry volgens het format hierboven en voeg 'm toe aan `PAGE_INFO`. Ken je de module (kern/wil/horizon) niet uit de route, check de laag/`layout.tsx` van die route voor `--module-active-*`.
- **inlineLiterals** — verhuis de tekst naar `PAGE_INFO` onder een sprekende key en herschrijf de call site naar `content={getPageInfo('key')}`.

Doe dit **zelf, inline** — geen subagent nodig voor een handvol entries (normale omvang: een nieuwe pagina in een feature-PR levert 1-3 treffers op).

### Grote refresh (uitzondering op "zelf doen")
Alleen bij een omvangrijke herziening (zoals de aanvankelijke INZICHT/GRIP-migratie, of een toon-brede herschrijving): groepeer de geraakte keys per module/domein en dispatch één content-schrijf-agent per groep. Elke agent **retourneert** zijn `{key: {insight, grip}}`-map als tekst — bewerkt `lib/page-info-content.ts` NOOIT zelf, om te voorkomen dat parallelle agents op hetzelfde bestand botsen. Eén afsluitende stap (hoofdthread) assembleert alle groepen in één bewerking en draait `npx tsc --noEmit` + `npm run page-info:check` opnieuw.

### 4. Verifiëren
`npx tsc --noEmit` (een hernoemde/verplaatste key raakt typisch geen types, maar een `getPageInfo`-aanroep met een verkeerd aantal argumenten wel) en `npm run page-info:check` opnieuw — moet 0 missing/inlineLiterals rapporteren.

## Afronding
Rapporteer: wat de detector vond, wat je toevoegde/verhuisde/verwijderde (met reden bij een verwijdering), en de schone detector-run als bewijs. Geen "info-knoppen actueel" claimen zonder die tweede run te tonen.
