/**
 * De CONFLICT-SLEUTEL van `valuations` — één plek, negen schrijvers.
 *
 * Elke herwaardering in de app is een dag-upsert op `valuations`: de
 * herwaarderingssheet, de check-in (bezittingen én schulden), het bewerkscherm van
 * een bezitting, het schuldformulier, de waarderingsmodal, de historische
 * verloop-editor en de banksync (waardering + compensatie). Ze sturen allemaal
 * dezelfde `onConflict`-sleutel, en dat is precies de reden dat die hier woont in
 * plaats van negen keer als letterlijke string: `ON CONFLICT` inferreert op een
 * exact passende unieke index, dus een sleutel die op één plek achterloopt breekt
 * daar hard met "no unique or exclusion constraint matching the ON CONFLICT
 * specification" — en dan is de herwaardering weg terwijl de gebruiker denkt dat
 * ze is opgeslagen.
 *
 * ## Waarom `user_id` en `entity_type` erin staan
 *
 * De oorspronkelijke sleutel was `(entity_id, valuation_date)`, zónder eigenaar.
 * Die conflict-target is cross-user: botst een `entity_id` tussen twee gebruikers,
 * dan landt de upsert van de een op de rij van de ander en loopt hij op de
 * RLS-check stuk in plaats van te mergen. `balance_snapshots` doet het wél goed
 * (`user_id, snapshot_date, entity_type, entity_id`); deze sleutel spiegelt dat.
 *
 * ## Migratie in twee stappen — waar we nu staan
 *
 * `supabase/migrations/20260730072804_add_valuations_user_scoped_unique.sql`
 * (stap 1, *expand*) heeft de nieuwe sleutel ERNAAST gezet; de oude constraint
 * `valuations_entity_id_valuation_date_key` staat er nog. Dat is bewust: vier van
 * de negen schrijvers zitten in client-componenten, en een browser houdt een al
 * geladen bundel vast — de oude sleutel mag dus pas vallen (stap 2, *contract*)
 * als de nieuwe bundel live is en er geen oude tabs meer op zitten. Zolang de oude
 * constraint bestaat, bestaat de cross-user-botsing ook nog; stap 2 is wat het
 * risico echt dicht.
 */
export const VALUATIONS_CONFLICT_KEY = 'user_id,entity_type,entity_id,valuation_date'
