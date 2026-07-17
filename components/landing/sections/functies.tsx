import {
  Tags,
  Wallet,
  TrendingUp,
  Hourglass,
  Calendar,
  Target,
  HelpCircle,
  Newspaper,
  Bell,
  Compass,
  Users,
  Heart,
  LineChart,
  Shuffle,
  ShieldAlert,
  Landmark,
} from 'lucide-react'
import {
  SectionRule,
  SectionTitle,
  ModuleKaart,
  PrivacyBullet,
} from '@/components/landing/section-primitives'
import {
  TijdasDemo,
  CashflowInzichtDemo,
  BalansDemo,
} from '@/components/landing/demo-mocks'
import { Reveal } from '@/components/landing/reveal'

/**
 * FunctiesSecties — de "hoe"-pagina, gespiegeld op de merkbelofte:
 * "Ontdek waar je staat, plan waar je heen gaat." Vier pijler-secties
 * (#inzicht, #grip, #nu, #toekomst) + #voor-wie. De section-ids zijn
 * deeplink-doelen vanaf de home-pijlers, header en footer.
 */
export function FunctiesSecties() {
  return (
    <>
      {/* ── PIJLER 1 — INZICHT ───────────────────────────────────── */}
      <SectionRule label="Inzicht" />
      <section id="inzicht" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="Pijler 1 — Inzicht"
            title="Zie wat er"
            italics="werkelijk gebeurt"
            intro="Transacties, budgetten, vermogen en groei — bijgehouden zonder dat jij hoeft te boekhouden, en altijd vertaald naar wat het betekent voor jouw vrijheid."
          />

          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
            <div className="space-y-6">
              <PrivacyBullet
                Icon={Tags}
                titel="Automatische categorisering"
                beschrijving="Transacties worden herkend en ingedeeld; jij corrigeert alleen de uitzonderingen."
              />
              <PrivacyBullet
                Icon={Wallet}
                titel="Budgetten die je begrijpt"
                beschrijving="Grenzen per maand, zichtbaar in euro's én in vrijheidsdagen."
              />
              <PrivacyBullet
                Icon={TrendingUp}
                titel="Vermogen en groei"
                beschrijving="Bezittingen, schulden en historie in één lijn — je ziet je vrijheid groeien."
              />
              <PrivacyBullet
                Icon={Hourglass}
                titel="Alles ook in tijd"
                beschrijving="Elke euro krijgt zijn vertaling naar vrijheidstijd: dagen, maanden, jaren."
              />
            </div>
            <div className="mx-auto w-full max-w-md">
              <CashflowInzichtDemo />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── PIJLER 2 — GRIP (Will, nieuws & notificaties) ────────── */}
      <SectionRule label="Grip" />
      <section id="grip" className="px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Pijler 2 — Grip · Will, je AI-coach"
            title="Niet een chatbot."
            italics="Een tweede paar ogen."
            intro="Will leeft door je hele app heen — als constatering in je briefing, als suggestie naast een doel, als signaal bij een afwijkende transactie. Altijd in dezelfde stem, altijd op basis van jóuw cijfers."
          />

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { Icon: Tags, titel: 'Categoriseert en signaleert', text: 'Will herkent en categoriseert je transacties — en signaleert wat afwijkt: een abonnement dat sluipend duurder wordt, een dubbele afschrijving.' },
              { Icon: Target, titel: 'Suggereert acties', text: 'Bij elk doel een paar concrete stappen die er sneller bij brengen.' },
              { Icon: Calendar, titel: 'Stelt gebeurtenissen voor', text: 'Verbouwing, kind, verhuizing — Will vertaalt naar tijd en geld op je tijdas.' },
              { Icon: Newspaper, titel: 'Persoonlijk financieel nieuws', text: 'De Krant brengt nieuws dat over jouw situatie gaat — gefilterd op jouw vermogen, plannen en interesses.' },
              { Icon: Bell, titel: 'Notificaties op maat', text: 'Een seintje als een budget knelt, een doel afwijkt of een vaste last verandert — jij kiest waarover.' },
              { Icon: HelpCircle, titel: 'Beantwoordt vragen', text: 'In jouw context, met jouw cijfers — geen generiek financieel adviespraatje.' },
            ].map((it) => (
              <div key={it.titel} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[var(--r)] border border-wil-200 bg-wil-50">
                  <it.Icon className="h-4 w-4 text-wil-700" aria-hidden="true" />
                </span>
                <p className="font-sans text-sm font-semibold text-[var(--ink)]">{it.titel}</p>
                <p className="mt-1 font-serif text-sm leading-relaxed text-[var(--ink-3)]">{it.text}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto max-w-2xl rounded-[var(--r-lg)] border border-l-[4px] border-l-wil-500 border-[var(--border-ed)] bg-[var(--paper)] px-6 py-5">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-700">
              En wat Will <em>niet</em> doet
            </p>
            <p className="mt-2 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
              Geen beleggingsadvies, geen koop- of verkoopaanbevelingen, geen
              productpromotie. Will rekent en suggereert &mdash; jij beslist.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── PIJLER 3 — NU ────────────────────────────────────────── */}
      <SectionRule label="Nu" />
      <section id="nu" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="Pijler 3 — Nu"
            title="Vandaag"
            italics="op orde"
            intro="Wat heb ik, en wat geef ik uit? Je huidige vermogen en je cashflow in één rustig beeld — het fundament onder elke keuze."
          />

          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
            <ModuleKaart
              kleur="var(--color-kern-600)"
              rubriek="Het Overzicht · Vandaag"
              titel="Wat heb ik, wat geef ik uit?"
              ondertitel="Alles wat je hebt en uitgeeft, in één rustig beeld."
              features={[
                'Bezittingen, schulden en netto vermogen',
                'Cashflow met al je transacties',
                'Abonnementen en vaste lasten in beeld',
                'Dagelijkse briefing met zes inzichten',
              ]}
              bgClass="bg-kern-50"
              borderClass="border-kern-200"
              iconColor="text-kern-600"
              Icon={Wallet}
            />
            <div className="mx-auto w-full max-w-md">
              <BalansDemo />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── PIJLER 4 — TOEKOMST ──────────────────────────────────── */}
      <SectionRule label="Toekomst" />
      <section id="toekomst" className="px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="Pijler 4 — Toekomst"
            title="Morgen"
            italics="eerlijk in beeld"
            intro="Een prognose is zo goed als de aannames eronder. Daarom rekenen we tegen echte marktdata, tonen we een bandbreedte in plaats van één gladde lijn — en rekenen je wensen én end-of-life voorkeuren gewoon mee."
          />

          <div className="mb-14 grid items-center gap-10 md:grid-cols-2 md:gap-14">
            <ModuleKaart
              kleur="var(--color-horizon-600)"
              rubriek="De Toekomst · Morgen + later"
              titel="Wat brengt mijn vrijheid dichterbij?"
              ondertitel="Levensgebeurtenissen, scenario's en je wensen — doorgerekend."
              features={[
                'Tijdas met levensgebeurtenissen (kinderen, verhuizing, pensioen)',
                'FIRE-prognose met scenario-vergelijking',
                'Wensen doorrekenen vóór je beslist',
                'End-of-life voorkeuren: wat mag er overblijven?',
              ]}
              bgClass="bg-horizon-50"
              borderClass="border-horizon-200"
              iconColor="text-horizon-600"
              Icon={Compass}
            />
            <div className="mx-auto w-full max-w-md">
              <TijdasDemo />
            </div>
          </div>

          {/* Waarom je deze projectie kunt vertrouwen */}
          <div className="mx-auto max-w-5xl">
            <p className="mb-6 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Geen hype, wel cijfers
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <PrivacyBullet
                Icon={LineChart}
                titel="55 jaar echte marktdata"
                beschrijving="Backtesting tegen werkelijke MSCI World-rendementen (1970–2024), niet tegen een gladde aanname."
              />
              <PrivacyBullet
                Icon={Shuffle}
                titel="Een waaier, geen losse voorspelling"
                beschrijving="Monte-Carlo-simulaties tonen een bandbreedte met kansen — optimistisch, verwacht én pessimistisch."
              />
              <PrivacyBullet
                Icon={ShieldAlert}
                titel="Getest tegen echte crashes"
                beschrijving="Hoe houdt je plan stand door 1987, 2000, 2008 en 2020? Dat reken je gewoon na."
              />
              <PrivacyBullet
                Icon={Landmark}
                titel="Box 3-bewust"
                beschrijving="De Nederlandse vermogensbelasting zit ingebakken in de prognose — in euro's én in vrijheidsdagen."
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── VOOR WIE ─────────────────────────────────────────────── */}
      <SectionRule label="Voor wie" />
      <section id="voor-wie" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Voor wie"
            title="Voor wie wel,"
            italics="en voor wie niet"
          />

          <div className="grid gap-6 md:grid-cols-2">
            {/* WEL */}
            <div className="rounded-[var(--r-lg)] border-2 border-kern-200 bg-kern-50/40 p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-100">
                  <TrendingUp className="h-4 w-4 text-kern-700" aria-hidden="true" />
                </span>
                <p className="font-sans text-sm font-bold uppercase tracking-[0.08em] text-kern-700">
                  Voor wie wel
                </p>
              </div>

              <ul className="space-y-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>Wie de vraag &ldquo;kan ik dit betalen?&rdquo; rustig wil beantwoorden</span>
                </li>
                <li className="flex items-start gap-2">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>30-50-jarigen met hypotheek, partner en kinderwens</span>
                </li>
                <li className="flex items-start gap-2">
                  <Compass className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>FIRE-aspiranten die concrete cijfers willen, geen memes</span>
                </li>
                <li className="flex items-start gap-2">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>Privé-gebruikers met vermogen in box 3, vastgoed, een BV of familievermogen</span>
                </li>
              </ul>
            </div>

            {/* NIET */}
            <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <p className="font-sans text-sm font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Voor wie niet
                </p>
              </div>

              <ul className="space-y-3 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                <li>
                  Mensen die enkel een betaalrekening willen &mdash; daar is je bank-app voor.
                </li>
                <li>
                  Wie een zakelijke boekhouding zoekt voor een BV of onderneming
                  &mdash; TriFinity is voor privé-gebruik; je BV verschijnt als bezitting.
                </li>
                <li>
                  Active day-traders &mdash; wij rekenen over jaren, niet over minuten.
                </li>
                <li>
                  Wie financieel advies wil zonder zelf na te denken &mdash;
                  Will rekent, jij beslist.
                </li>
              </ul>

              <p className="mt-5 border-t border-dashed border-[var(--border-ed)] pt-4 font-serif text-xs italic text-[var(--ink-4)]">
                Eerlijk zijn over wat we niet zijn, bespaart frustratie aan beide kanten.
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
