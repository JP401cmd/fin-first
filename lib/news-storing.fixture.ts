// ── Fixture: de onderhoudspagina van de Belastingdienst (26 sep 2026) ──
//
// Tijdens gepland onderhoud serveerde de Belastingdienst op élke URL een 200
// met deze melding. De ingest maakte er een artikel van: rij
// `41f41a58-bdc8-46f5-82f9-53713fc93716` ("Belastingdienst — Box 3").
//
// De pagina zelf bestaat niet meer (het onderhoud is voorbij), dus dit is een
// GETROUWE MINIMALE reconstructie: de kop en de tekst zijn letterlijk de
// `bron_kop` en het `bron_fragment` van die productierij. `STORING_BRON_KOP`
// en `STORING_BRON_FRAGMENT` staan er los naast, zodat de test kan bewijzen dat
// `extractSecties` uit deze HTML exact die rij teruglevert — anders zou de
// regressietest een verzonnen pagina toetsen.

export const STORING_BRON_KOP = 'De websites van de Belastingdienst zijn niet beschikbaar'

export const STORING_BRON_FRAGMENT =
  'Op dit moment zijn de websites en de portalen van de Belastingdienst in verband met gepland onderhoud helaas niet beschikbaar. Het gaat o.a. om: www.belastingdienst.nl www.toeslagen.nl www.douane.nl www.fiod.nl Vanaf 08:00 uur zijn deze websites weer beschikbaar. Onze excuses voor het ongemak.'

/** Mét de melding als `<h1>` — de vorm die de productierij verklaart (kop = paginatitel). */
export const BELASTINGDIENST_STORING_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Belastingdienst</title>
</head>
<body>
<header><img src="/logo.svg" alt="Logo Belastingdienst"></header>
<main>
<h1>De websites van de Belastingdienst zijn niet beschikbaar</h1>
<p>Op dit moment zijn de websites en de portalen van de Belastingdienst in verband met gepland onderhoud helaas niet beschikbaar.</p>
<p>Het gaat o.a. om:</p>
<ul>
<li>www.belastingdienst.nl</li>
<li>www.toeslagen.nl</li>
<li>www.douane.nl</li>
<li>www.fiod.nl</li>
</ul>
<p>Vanaf 08:00 uur zijn deze websites weer beschikbaar. Onze excuses voor het ongemak.</p>
</main>
</body>
</html>`

/**
 * Dezelfde melding zonder `<h1>` en met een gewone `<title>`: de tweede tak van
 * `isStoringspagina` (korte pagina, melding in de aanhef) moet hem dan vangen.
 */
export const STORING_ZONDER_KOP_HTML = `<!DOCTYPE html>
<html lang="nl"><head><title>Belastingdienst</title></head>
<body><main>
<p>Op dit moment zijn de websites en de portalen van de Belastingdienst in verband met gepland onderhoud helaas niet beschikbaar.</p>
<p>Vanaf 08:00 uur zijn deze websites weer beschikbaar. Onze excuses voor het ongemak.</p>
</main></body></html>`
