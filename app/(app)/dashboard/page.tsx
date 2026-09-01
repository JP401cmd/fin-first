import { redirect } from 'next/navigation'

/**
 * /dashboard is het universele "ga naar home"-doel (PWA start_url,
 * SAFE_REDIRECT_FALLBACK). De edge-middleware (lib/supabase/proxy.ts) vangt
 * hem af en vertaalt naar het gekozen homescherm (profiles.home_screen);
 * de vroegere next.config-redirect is daarvoor verwijderd. Deze page-redirect
 * blijft als geschaduwde terugval voor het geval de middleware niet draait —
 * bewust statisch naar /overzicht (de default), géén profielread: een
 * redirect-only server component mag niet uitgroeien tot het echte pad
 * (React #310 bij SPA-navigatie, zie next.config.ts).
 */
export default function DashboardRedirect() {
  redirect('/overzicht')
}
