/**
 * De productpreset op de EIGEN profielrij zetten — één schrijfpad voor twee
 * ingangen (Krant 2C, ADR 0192):
 *
 *   - `PUT /api/modules` (de productkeuze Krant ⇄ Geheel, ADR 0184);
 *   - de auth-callback bij aanmelden via de Krant-ingang
 *     (`/signup?product=krant`), alleen voor een vers account.
 *
 * De preset zelf staat in `PRODUCT_PRESETS` (lib/modules/resolve.ts); dit
 * bestand schrijft hem. Beide kolommen in één update, zodat er nooit een
 * account bestaat met de modules van het ene product en het homescherm van
 * het andere.
 *
 * SECURITY: own-row update via de SESSIE-client die de aanroeper meegeeft
 * (anon-sleutel + RLS, `.eq('id', userId)` met de id uit de sessie), nooit
 * service-role. `active_modules` en `home_screen` vallen buiten de
 * guard-trigger op `profiles` (die bewaakt role/tier/abonnementen): modules
 * zijn geen betaalrecht.
 *
 * `alleenVersAccount`: de update draagt dan ook `.eq('onboarding_completed',
 * false)`. Postgres toetst die voorwaarde onder de rijlock, dus een account
 * dat zijn onboarding al afrondde wordt nooit omgezet — ook niet als de
 * callback een oude aanmeldlink ontvangt. `gezet` zegt of er een rij geraakt is.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HomeScreen } from '@/lib/home-screen'
import { validateModules, type ModuleId } from '@/lib/module-registry'
import { PRODUCT_PRESETS, type Product } from './resolve'

export interface ProductPresetUitkomst {
  modules: ModuleId[]
  homeScreen: HomeScreen
  /** Is de eigen rij daadwerkelijk bijgewerkt? Altijd true zonder `alleenVersAccount`. */
  gezet: boolean
}

export async function zetProductPreset(
  supabase: SupabaseClient,
  userId: string,
  product: Product,
  opts: { alleenVersAccount?: boolean } = {},
): Promise<ProductPresetUitkomst> {
  const preset = PRODUCT_PRESETS[product]
  // Een verse array: de bevroren preset en ALL_MODULES blijven onaangeraakt.
  const modules = [...preset.modules]

  // Guard: een preset moet zelf een geldige moduleset zijn (afhankelijkheden
  // uit de catalogus). Faalt dit, dan is de preset-definitie kapot — een
  // serverfout, geen invoerfout.
  const check = validateModules(modules)
  if (!check.valid) {
    throw new Error(`Ongeldige preset '${product}': ${check.errors.join(' ')}`)
  }

  const velden = { active_modules: modules, home_screen: preset.homeScreen }

  if (opts.alleenVersAccount) {
    const { data, error } = await supabase
      .from('profiles')
      .update(velden)
      .eq('id', userId)
      .eq('onboarding_completed', false)
      .select('id')
    if (error) throw error
    return { modules, homeScreen: preset.homeScreen, gezet: (data ?? []).length === 1 }
  }

  const { error } = await supabase.from('profiles').update(velden).eq('id', userId)
  if (error) throw error
  return { modules, homeScreen: preset.homeScreen, gezet: true }
}
