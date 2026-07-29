import Link from 'next/link'
import { ShieldCheck, Lock, Eye, Fingerprint } from 'lucide-react'
import {
  SectionRule,
  SectionTitle,
  PrivacyBullet,
} from '@/components/landing/section-primitives'
import { Reveal } from '@/components/landing/reveal'

/**
 * VeiligheidSecties — de inhoud van de /veiligheid-pagina ("vertrouwen").
 *
 * Bewuste eerlijkheids-randvoorwaarden (pre-launch product): GEEN
 * AFM/DNB/PSD2-badges of -claims (TriFinity heeft géén Wft-vergunning —
 * het is een educatief reken-instrument), GEEN verzonnen reviews,
 * gebruikersaantallen of certificeringen, GEEN bankkoppeling-beloftes.
 * Vertrouwen komt uitsluitend uit ware claims: EU-hosting (Ierland),
 * versleuteling, geen dataverkoop, beperkte AI-context, open methodologie,
 * data-export en het eerlijke Wft-kader.
 *
 * Server-component (geen hooks). Vier secties in krantenstijl, elk
 * voorafgegaan door een SectionRule, afgesloten met een verwijsstrook.
 */
export function VeiligheidSecties() {
  return (
    <>
      {/* ── JOUW DATA — vier afspraken ───────────────────────────── */}
      <SectionRule label="Jouw data" />
      <section id="data" className="px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Hoe wij omgaan met jouw data"
            title="Vier afspraken,"
            italics="zwart op wit"
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <PrivacyBullet
              Icon={ShieldCheck}
              titel="EU-hosted"
              beschrijving="Je financiële gegevens leven op Supabase-servers in Ierland (EU), versleuteld in rust en transport. Alleen voor de AI-functies sturen we strikt-noodzakelijke context naar onze AI-subprocessor — nooit je volledige dataset, nooit voor advertenties of verkoop aan derden."
            />
            <PrivacyBullet
              Icon={Lock}
              titel="Wij verkopen je data niet"
              beschrijving="Punt. Geen ads, geen marketing-pixels, geen verkoop aan derden. Ons businessmodel is jouw abonnement, niet jouw data."
            />
            <PrivacyBullet
              Icon={Eye}
              titel="Open methodologie"
              beschrijving="De rekenhulp-formules zijn inspecteerbaar. Geen black box: je ziet welke aannames een uitkomst bepalen."
            />
            <PrivacyBullet
              Icon={Fingerprint}
              titel="Eigen export, altijd"
              beschrijving="Download je kern-financiële gegevens (transacties, budgetten, vermogen, bezittingen, schulden, doelen) als CSV wanneer je wilt. Geen vendor-lock-in bij opzegging."
            />
          </div>
        </Reveal>
      </section>

      {/* ── AI & JOUW GEGEVENS ───────────────────────────────────── */}
      <SectionRule label="AI & jouw gegevens" />
      <section id="ai" className="bg-[var(--subtle)] px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-3xl">
          <div className="rounded-[var(--r-lg)] border border-l-[4px] border-[var(--border-ed)] border-l-wil-500 bg-[var(--paper)] px-6 py-7 md:px-8 md:py-8">
            <h2 className="mb-4 font-display text-[1.5rem] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] md:text-[1.8rem]">
              Wat we wél en niet naar AI sturen
            </h2>
            <div className="space-y-4 font-serif text-base leading-relaxed text-[var(--ink-2)]">
              <p>
                <strong className="font-semibold text-[var(--ink)]">Wél:</strong>{' '}
                de strikt-noodzakelijke context voor precies de functie die je
                vraagt — bijvoorbeeld de cijfers achter die ene rekenvraag, of de
                paar posten die bij jouw vooruitblik horen. Niet méér dan de taak
                vereist.
              </p>
              <p>
                <strong className="font-semibold text-[var(--ink)]">Niet:</strong>{' '}
                nooit je volledige dataset, nooit voor advertenties, en nooit voor
                verkoop aan derden of training door derden op jouw
                persoonsgegevens zonder rechtsgrondslag. De AI rekent mee aan de
                vraag die vóór je ligt — daar houdt het op.
              </p>
            </div>
            <p className="mt-6 border-t border-dashed border-[var(--border-ed)] pt-4 font-sans text-sm text-[var(--ink-3)]">
              Het volledige beleid staat in ons{' '}
              <Link
                href="/privacy"
                className="font-medium text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 transition-colors hover:decoration-[var(--ink)]"
              >
                privacybeleid
              </Link>
              .
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── OPEN METHODOLOGIE ────────────────────────────────────── */}
      <SectionRule label="Open methodologie" />
      <section id="methodologie" className="px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Geen black box"
            title="Je kunt elke uitkomst"
            italics="narekenen"
          />

          <div className="mx-auto max-w-2xl space-y-4 font-serif text-base leading-relaxed text-[var(--ink-2)]">
            <p>
              Een getal zonder onderbouwing is een gok met opmaak. Daarom zijn
              de formules achter elke rekenhulp inspecteerbaar, en zijn de
              aannames die een uitkomst bepalen niet alleen instelbaar maar ook
              zichtbaar — je ziet welke knoppen aan welke knop draaien.
            </p>
            <p>
              Projecties toetsen we tegen 55 jaar échte marktdata (MSCI World,
              1970–2024). Geen enkele gladde lijn die zekerheid suggereert die er
              niet is: we tonen Monte-Carlo-bandbreedtes, zodat je de spreiding
              ziet in plaats van één gepoetste belofte.
            </p>
          </div>

          <p className="mx-auto mt-8 max-w-2xl font-sans text-sm">
            <Link
              href="/functies#toekomst"
              className="font-medium text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 transition-colors hover:decoration-[var(--ink)]"
            >
              Bekijk de projectie-aanpak op de functiepagina →
            </Link>
          </p>
        </Reveal>
      </section>

      {/* ── EERLIJK KADER — geen financieel advies ───────────────── */}
      <SectionRule label="Eerlijk kader" />
      <section id="advies" className="bg-[var(--subtle)] px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-3xl">
          <h2 className="mb-5 font-display text-[1.6rem] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] md:text-[2rem]">
            Wat deze app wél en niet is
          </h2>
          <div className="space-y-4 font-serif text-base leading-relaxed text-[var(--ink-2)]">
            <p>
              TriFinity is een educatief reken-instrument. Het is uitdrukkelijk
              geen financieel advies in de zin van de Wet op het financieel
              toezicht (Wft) — wij bezitten bewust geen vergunning en bieden er
              ook geen aan.
            </p>
            <p>
              Fin, de AI-coach, blijft binnen datzelfde kader: geen
              beleggingsadvies, geen koop- of verkoopaanbevelingen, geen
              productpromotie. Fin rekent en suggereert; jij beslist. Voor
              concrete productkeuzes of fiscale planning blijft een erkend
              adviseur de aangewezen route.
            </p>
          </div>

          <p className="mt-6 font-sans text-sm">
            <Link
              href="/wft"
              className="font-medium text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 transition-colors hover:decoration-[var(--ink)]"
            >
              Lees de volledige Wft-disclaimer →
            </Link>
          </p>
        </Reveal>
      </section>

      {/* ── VERWIJSSTROOK — juridische pagina's ──────────────────── */}
      <section className="px-6 pb-4 pt-12 md:px-12">
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { href: '/privacy', label: 'Privacybeleid' },
            { href: '/voorwaarden', label: 'Algemene voorwaarden' },
            { href: '/wft', label: 'Wft-disclaimer' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-center font-sans text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:text-[var(--ink)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
