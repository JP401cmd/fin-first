# Verwijder auto-seeding van voorbeelddata bij lege bezittingen/schulden

**Datum:** 2026-03-30
**Status:** Ontwerp
**Type:** Bugfix

## Context

Na het voltooien van de onboarding zonder bezittingen of schulden in te voeren, worden er bij het openen van de bezittingen- of schuldenmodal automatisch voorbeelddata in de database geschreven. Dit is ongewenst: de gebruiker heeft bewust geen data ingevoerd, maar krijgt nu nepdata die alle berekeningen (vermogen, FIRE-projecties, vrijheidstijd) vervuilt.

### Oorzaak

Beide modal-pagina's bevatten een auto-seeding mechanisme dat activeert wanneer er 0 records gevonden worden:

- **`components/core/assets-client.tsx`** (regels 102-110): als 0 assets → roept `seedAssets()` aan (regels 201-233), die `getDefaultAssets()` uit `lib/asset-data.ts` (regel 438) aanroept
- **`app/(app)/core/debts/page.tsx`** (regels 174-182): als 0 debts → roept `seedDebts()` aan (regels 213-241), die `getDefaultDebts()` uit `lib/debt-data.ts` (regel 603) aanroept

### Geseede data

**5 bezittingen:** Spaarrekening (EUR 8.500), DEGIRO Beleggingsrekening (EUR 12.400), Pensioenfonds (EUR 34.000), Eigen woning (EUR 340.000), Auto (EUR 8.500)

**3 schulden:** Hypotheek (EUR 248.000), Persoonlijke lening (EUR 2.800), Studielening DUO (EUR 14.200)

### Impact

- Data wordt **permanent** in de database geschreven zonder markering als voorbeeld
- Alle berekeningen worden beïnvloed door nepdata
- Gebruiker moet handmatig alles verwijderen

## Oplossing

### Stap 1: Verwijder auto-seeding logica

- **`components/core/assets-client.tsx`**: verwijder de `if (!data || data.length === 0)` branch (regels 102-110) die `seedAssets()` aanroept, en verwijder de `seedAssets()` functie (regels 201-233)
- **`app/(app)/core/debts/page.tsx`**: verwijder de `if (!data || data.length === 0)` branch (regels 174-182) die `seedDebts()` aanroept, en verwijder de `seedDebts()` functie (regels 213-241)

### Stap 2: Lege-staat UI toevoegen

Wanneer er geen bezittingen of schulden zijn, toon een vriendelijke lege-staat in plaats van auto-seeding:
- Tekst: "Nog geen bezittingen/schulden toegevoegd"
- Prominente "Toevoegen" knop
- Consistent met het editorial finance design language

### Stap 3: Opruimen helpers (optioneel)

Controleer of `getDefaultAssets()` in `lib/asset-data.ts` en `getDefaultDebts()` in `lib/debt-data.ts` nog elders gebruikt worden. Zo niet, verwijder ze.

## Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `components/core/assets-client.tsx` | Verwijder seed-trigger + seedAssets() |
| `app/(app)/core/debts/page.tsx` | Verwijder seed-trigger + seedDebts() |
| `lib/asset-data.ts` | Verwijder getDefaultAssets() (indien ongebruikt) |
| `lib/debt-data.ts` | Verwijder getDefaultDebts() (indien ongebruikt) |
