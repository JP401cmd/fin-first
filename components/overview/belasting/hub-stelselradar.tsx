import { Kicker, ScenarioCallout } from '@/components/editorial'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-will-button'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * HubStelselradar (C8) — statische, educatieve radar van aankomende
 * wijzigingen in het Nederlandse belastingstelsel. Puur informatief: geen
 * berekening, geen perspectief, geen data-fetching (server-compatible).
 *
 * Elke wijziging krijgt een mono-jaar-chip, een box-kleur-streep (functionele
 * onderscheiding) en een korte uitleg in Source Serif. Bron-jaartallen zijn
 * indicatief (verifieer tegen Belastingdienst / Prinsjesdag-stukken) — daarom
 * de cursieve voetregel als ScenarioCallout.
 */

interface StelselItem {
  year: string
  title: string
  description: string
  /** Box-kleur-accent (amber/violet/teal); null = stelselbreed. */
  box: 1 | 2 | 3 | null
}

// Per-box coderingskleur voor de jaar-chip + linker-streep via de
// --color-box{n}-700 tokens. De hub heeft een neutraal-ink context, dus de
// box-kleuren worden hier direct gezet (niet via --module-active).
const BOX_COLOR: Record<1 | 2 | 3, string> = {
  1: 'var(--color-box1-700)', // amber
  2: 'var(--color-box2-700)', // violet
  3: 'var(--color-box3-700)', // teal
}

function accentFor(box: 1 | 2 | 3 | null): string {
  return box ? BOX_COLOR[box] : 'var(--ink-3)'
}

const ITEMS: StelselItem[] = [
  {
    year: '2027',
    title: 'Groen beleggen — vrijstelling afgebouwd',
    description:
      'De extra heffingskorting en de Box 3-vrijstelling voor groene beleggingen worden afgebouwd, waardoor groen sparen/beleggen fiscaal minder aantrekkelijk wordt.',
    box: 3,
  },
  {
    year: '2027',
    title: 'Expatregeling (30%/27%-regeling) versoberd',
    description:
      'De onbelaste vergoeding voor ingekomen werknemers daalt richting 27%, met aangepaste salarisnormen. Relevant voor wie onder de kennismigranten-/expatregeling valt.',
    box: 1,
  },
  {
    year: '2028',
    title: 'Box 3 — nieuw stelsel op werkelijk rendement',
    description:
      'Het forfaitaire stelsel wordt vervangen door heffing over het werkelijk behaalde rendement (vermogensaanwasbelasting): rente, dividend, huur én waardeontwikkeling worden belast.',
    box: 3,
  },
  {
    year: 'lopend',
    title: 'Wet Hillen — verdere afbouw',
    description:
      'De aftrek wegens geen of geringe eigenwoningschuld (Wet Hillen) wordt jaarlijks verder afgebouwd, waardoor een (bijna) afgeloste hypotheek geleidelijk meer eigenwoningforfait kost.',
    box: 1,
  },
]

export function HubStelselradar() {
  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Stelselradar — wat verandert er</Kicker>

      <ul className="mt-4 border-t border-[var(--rule-soft)]">
        {ITEMS.map((item, i) => {
          const accent = accentFor(item.box)
          return (
            <li
              key={i}
              className="relative border-b border-[var(--rule-soft)] last:border-b-0 py-4 pl-4"
            >
              {/* Box-kleur-streep links — functionele onderscheiding. */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-4 bottom-4 w-[3px]"
                style={{ backgroundColor: accent }}
              />
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span
                  className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] tabular-nums"
                  style={{ color: accent }}
                >
                  {item.year}
                </span>
                <span className="text-sm font-semibold text-[var(--ink)] leading-snug">
                  {item.title}
                </span>
              </div>
              <p
                className="mt-1.5 text-xs text-[var(--ink-2)] leading-relaxed italic max-w-[64ch]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                {item.description}
              </p>
              <div className="mt-2.5">
                <BesprekMetWillButton onderwerp={item.title} detail={item.description} />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-5">
        <ScenarioCallout title="Indicatie, geen advies.">
          {' '}Indicatieve jaartallen — verifieer tegen de actuele Belastingdienst-
          en Prinsjesdag-stukken.
        </ScenarioCallout>
      </div>
    </article>
  )
}
