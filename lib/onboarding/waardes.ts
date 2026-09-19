/**
 * De vier waardes waar TriFinity om draait, elk in zijn eigen accent — puur
 * data, geen React. Tot 19 sep 2026 stonden ze in de welkomstpopup vóór stap 1
 * (`components/onboarding/welcome-popup.tsx`, toegevoegd 17 sep 2026); met
 * B-052 is die popup twee regels geworden en verhuizen de vier waardes naar het
 * successcherm ná de onboarding (W-015, `components/onboarding/
 * onboarding-success.tsx`) — het moment waarop er data staat om ze waar te
 * maken. Eén bron zodat er nooit twee versies van deze vier regels ontstaan.
 *
 * **Over de accent-toewijzing — er zijn vier accenten en drie hefbomen, dus hij
 * kan niet overal kloppen.** De accenten heten op /mijn/uiterlijk Bezittingen
 * (`kern`) · Schulden (`wil`) · Budget (`horizon`) · Fin (`fin`). Drie waardes
 * vallen daar exact op: "wat je hebt" → kern, "wat er omgaat" → horizon,
 * "waar je op kunt sturen" → fin. De vierde, "waar het op uitloopt", heeft
 * geen eigen hefboom — er ís geen Toekomst-accent — en krijgt daarom het
 * overgebleven accent (`wil`). Noem dat dus niet "de kleur van de toekomst":
 * dezelfde tint betekent in de stappen Schulden. Wie hier ooit betekenis aan
 * wil hangen, moet eerst een vijfde accent invoeren, niet de comment oprekken.
 *
 * Copy-grens: elke regel beschrijft wat de app TOONT, nooit wat de gebruiker
 * zou moeten doen of wat iets gaat opleveren — inzicht mag, advies niet
 * (Wft-grens, zie de compliance-check-skill).
 */

export type WaardeAccent = 'kern' | 'wil' | 'horizon' | 'fin'

export interface Waarde {
  kicker: string
  belofte: string
  toelichting: string
  /** Accent-sleutel: `var(--color-<accent>-500)` voor de streep, `-700` voor de kicker. */
  accent: WaardeAccent
}

export const WAARDES: readonly Waarde[] = [
  {
    kicker: 'Wat je hebt',
    belofte: 'Je vermogen in euro’s én in jaren.',
    toelichting:
      'We tellen je bezittingen, schulden en pensioen bij elkaar op, en rekenen dat bedrag om naar de tijd die het je vrij koopt.',
    accent: 'kern',
  },
  {
    kicker: 'Wat er omgaat',
    belofte: 'Elke maand zie je wat je vrijkoopt.',
    toelichting:
      'Je ziet wat er binnenkomt, waar het heen gaat en wat je overhoudt — inclusief de abonnementen die stilletjes blijven lopen.',
    accent: 'horizon',
  },
  {
    kicker: 'Waar het op uitloopt',
    belofte: 'De datum waarop werken een keuze wordt.',
    toelichting:
      'We rekenen je plan door op je eigen cijfers en schuiven die datum mee zodra er iets verandert.',
    accent: 'wil',
  },
  {
    kicker: 'Waar je op kunt sturen',
    belofte: 'Zie wat één keuze met die datum doet.',
    toelichting:
      'Fin rekent mee, wijst aan welke knop het zwaarst weegt en laat zien wat er gebeurt als je eraan draait.',
    accent: 'fin',
  },
]
