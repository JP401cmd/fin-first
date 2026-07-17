/**
 * Vertaalt rauwe (Engelse) Supabase-authfouten naar begrijpelijke NL-copy.
 *
 * Supabase-auth geeft technische, Engelstalige foutmeldingen terug
 * ("Invalid login credentials", "User already registered", …). Die tonen we
 * niet rauw aan de gebruiker. Deze pure functie mapt de bekende codes/messages
 * naar copy volgens de formule "wat ging mis + hoe fix je het", met een
 * generieke NL-fallback voor het onbekende.
 *
 * Gebruikt op alle auth-pagina's (signup/login/forgot-password/reset-password)
 * zowel in de `{ error }`-tak (Supabase gaf een fout terug) als in de
 * catch-tak (de fetch gooide) — beide funnelen door deze functie, zodat de
 * copy overal consistent is.
 */

/** Offline/netwerk-copy (A-02): geen verbinding met de authserver. */
export const AUTH_NETWORK_MESSAGE =
  'Geen verbinding — controleer je internet en probeer het opnieuw.'

/** Generieke fallback voor onbekende fouten. */
export const AUTH_GENERIC_MESSAGE = 'Er ging iets mis. Probeer het opnieuw.'

/**
 * Load-bearing sentinel-substring uit de `before_user_created`-hook-melding
 * (ADR 0047). De hook weigert een niet-uitgenodigd adres met deze stabiele,
 * hoofdletter-token in de foutmelding; front-end en OAuth-callback herkennen 'm
 * hieraan. Bewust een sentinel i.p.v. de NL-copy zelf, zodat de melding kan
 * wijzigen zonder de match te breken.
 */
export const SIGNUP_NOT_INVITED_SENTINEL = 'TRIFINITY_NOT_INVITED'

type AuthErrorFields = {
  message: string
  code: string
  name: string
}

/**
 * Haalt message/code/name veilig uit een onbekende fout-waarde. Supabase-fouten
 * zijn objecten met `.message`/`.code`/`.name`; een gegooide netwerkfout is een
 * TypeError; alles anders normaliseren we naar lege strings.
 */
function extractAuthErrorFields(error: unknown): AuthErrorFields {
  if (typeof error === 'string') {
    return { message: error, code: '', name: '' }
  }
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; code?: unknown; name?: unknown }
    return {
      message: typeof candidate.message === 'string' ? candidate.message : '',
      code: typeof candidate.code === 'string' ? candidate.code : '',
      name: typeof candidate.name === 'string' ? candidate.name : '',
    }
  }
  return { message: '', code: '', name: '' }
}

/**
 * Herkent de "e-mailadres is al geregistreerd"-fout van Supabase `signUp`.
 *
 * ANTI-ENUMERATIE: de signup-pagina gebruikt deze predicate om het
 * al-geregistreerd-geval IDENTIEK aan succes te behandelen (zelfde
 * "Controleer je e-mail"-scherm, geen onthullende melding), zodat een
 * aanvaller niet uit de UI kan afleiden of een adres al een account heeft.
 * De NL-vertaling in `translateAuthError` hieronder blijft bestaan voor andere
 * consumers (waar onthulling geen lek is), maar signup mag 'm niet tonen —
 * zie `app/signup/page.tsx`.
 */
export function isUserAlreadyRegisteredError(error: unknown): boolean {
  const { message, code } = extractAuthErrorFields(error)
  const haystack = `${code} ${message}`.toLowerCase()
  return haystack.includes('user already registered') || code === 'user_already_exists'
}

export function translateAuthError(error: unknown): string {
  const { message, code, name } = extractAuthErrorFields(error)
  // Case-insensitief matchen op zowel de message als de code, zodat we niet
  // afhankelijk zijn van exacte Supabase-formulering of -versie.
  const haystack = `${code} ${message}`.toLowerCase()

  // Netwerk/offline eerst: Supabase geeft dit terug als AuthRetryableFetchError,
  // of de onderliggende fetch gooit een TypeError("Failed to fetch").
  if (
    name === 'AuthRetryableFetchError' ||
    haystack.includes('failed to fetch') ||
    haystack.includes('fetch failed') ||
    haystack.includes('networkerror') ||
    haystack.includes('network error') ||
    haystack.includes('network request failed')
  ) {
    return AUTH_NETWORK_MESSAGE
  }

  // Besloten testfase (ADR 0047): de before_user_created-hook weigert een niet-
  // uitgenodigd adres met de sentinel in de melding. `haystack` is al
  // ge-lowercased, dus we vergelijken tegen de lowercase sentinel.
  //
  // Bewust GEEN account-enumeratie: dit signaleert alleen allowlist-membership
  // (staat je adres op de uitnodigingslijst) — het onthult NIET of er al een
  // account bestaat op dat adres. De "al geregistreerd"-afhandeling hieronder
  // blijft los daarvan (signup toont die bewust niet — anti-enumeratie).
  if (haystack.includes(SIGNUP_NOT_INVITED_SENTINEL.toLowerCase())) {
    return 'TriFinity zit in een besloten testfase. Dit e-mailadres heeft nog geen toegang.'
  }

  if (isUserAlreadyRegisteredError(error)) {
    return "Dit e-mailadres is al geregistreerd — log in of gebruik 'wachtwoord vergeten'."
  }

  if (haystack.includes('invalid login credentials') || code === 'invalid_credentials') {
    return 'E-mailadres of wachtwoord klopt niet.'
  }

  if (haystack.includes('email not confirmed') || code === 'email_not_confirmed') {
    return 'Bevestig eerst je e-mailadres via de link in je mail.'
  }

  if (
    haystack.includes('rate limit') ||
    haystack.includes('too many requests') ||
    haystack.includes('you can only request this after') ||
    code.includes('rate_limit')
  ) {
    return 'Te veel pogingen — wacht even en probeer opnieuw.'
  }

  if (
    haystack.includes('weak password') ||
    haystack.includes('at least 6 characters') ||
    haystack.includes('password should be at least') ||
    code === 'weak_password'
  ) {
    return 'Kies een wachtwoord van minimaal 6 tekens.'
  }

  return AUTH_GENERIC_MESSAGE
}
