// lib/version-status/migrations.ts
//
// PURE helpers voor de Supabase-migratiedrift op /beheer/versie. Geen fs/IO —
// de route leest de bestandsnamen en de toegepaste versies en voert ze hierin,
// zodat de drift-berekening los testbaar is.

/**
 * Haal de versie (timestamp-prefix vóór de eerste underscore) uit een
 * migratie-bestandsnaam. `20260717132632_naam.sql` → `20260717132632`.
 * Null als de naam geen numerieke prefix heeft.
 */
export function migrationVersionFromFilename(filename: string): string | null {
  const m = filename.match(/^(\d+)_/)
  return m ? m[1] : null
}

export interface MigrationDrift {
  /** Lexicografisch grootste toegepaste versie (= chronologisch, want zero-padded
   *  timestamps), of null als er niets is toegepast. */
  maxApplied: string | null
  /** Bestandsversies STRIKT groter dan maxApplied en niet toegepast — het echte
   *  "moet nog toegepast worden"-signaal. */
  pendingNewer: string[]
  /** Bestandsversies ≤ maxApplied die niet in de toegepaste lijst staan — pre-
   *  existente lineage-divergentie (de map is hernummerd t.o.v. de DB). Informatief. */
  driftOlder: string[]
  /** Toegepast, maar geen bijbehorend bestand. */
  unknownApplied: string[]
}

/**
 * Vergelijk de migratie-versies in de map met de toegepaste versies uit de DB.
 *
 * Belangrijk: op een repo waar de lokale migratie-lineage grootschalig is
 * hernummerd t.o.v. de DB (andere timestamps voor dezelfde DDL) zou een simpele
 * "in de map, niet toegepast" honderden vals-positieve pendings geven. Daarom
 * splitsen we op maxApplied: alleen bestanden NIEUWER dan alles wat is toegepast
 * (`pendingNewer`) zijn een echt actiesignaal; oudere ontbrekende (`driftOlder`)
 * zijn ruis van de divergentie en louter informatief.
 *
 * Beide lijsten worden ontdubbeld en gesorteerd voor stabiele weergave.
 */
export function computeMigrationDrift(
  fileVersions: string[],
  appliedVersions: string[],
): MigrationDrift {
  const files = new Set(fileVersions)
  const applied = new Set(appliedVersions)

  const maxApplied =
    appliedVersions.length > 0 ? appliedVersions.reduce((a, b) => (b > a ? b : a)) : null

  const notApplied = [...files].filter((v) => !applied.has(v))
  // Zonder toegepaste historie is alles per definitie "nieuwer dan niets".
  const pendingNewer = notApplied.filter((v) => maxApplied === null || v > maxApplied).sort()
  const driftOlder = notApplied.filter((v) => maxApplied !== null && v <= maxApplied).sort()
  const unknownApplied = [...applied].filter((v) => !files.has(v)).sort()

  return { maxApplied, pendingNewer, driftOlder, unknownApplied }
}
