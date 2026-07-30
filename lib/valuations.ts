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
 * ## Migratie in twee stappen — stap 2 staat klaar, wacht op de deploy
 *
 * `supabase/migrations/20260730072804_add_valuations_user_scoped_unique.sql`
 * (stap 1, *expand*) heeft de nieuwe sleutel ERNAAST gezet. Stap 2 (*contract*)
 * ligt klaar als `20260730210158_drop_valuations_legacy_entity_date_unique.sql`
 * en laat `valuations_entity_id_valuation_date_key` vallen. Pas met die tweede
 * stap is de cross-user-botsing echt weg: zolang de oude constraint bestaat,
 * dwingt zíj het conflict nog steeds af en voorkomt de nieuwe sleutel feitelijk
 * niets.
 *
 * **De volgorde is de hele truc, en niet vrijblijvend.** Stap 2 mag pas draaien
 * in dezelfde deploy als (of ná) de bundel die dít bestand bevat. `ON CONFLICT`
 * inferreert op een exact passende unieke index, dus een gedeployede bundel die
 * nog `onConflict: 'entity_id,valuation_date'` meestuurt breekt hard met
 * "no unique or exclusion constraint matching the ON CONFLICT specification"
 * zodra de oude sleutel weg is — en dan is de herwaardering weg terwijl de
 * gebruiker denkt dat ze is opgeslagen. Vier van de negen schrijvers zitten
 * bovendien in client-componenten, en een browser houdt een al geladen bundel
 * vast: laat na de deploy ruimte voor oude tabs.
 *
 * In de boom is geverifieerd dat élke schrijver deze constante gebruikt. Die eis
 * blijft gelden voor elke nieuwe schrijver.
 */
export const VALUATIONS_CONFLICT_KEY = 'user_id,entity_type,entity_id,valuation_date'
