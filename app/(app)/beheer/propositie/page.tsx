export default function PropositiePage() {
  return (
    <div className="space-y-8">
      {/* Filosofie */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-3 text-[var(--ink-4)]">Filosofie</p>
        <blockquote className="border-l-3 border-kern-500 pl-4 font-serif text-lg italic leading-relaxed text-[var(--ink-2)]">
          &ldquo;Geld is opgeslagen tijd &mdash; elke euro vertegenwoordigt een stukje levenstijd.&rdquo;
        </blockquote>
      </section>

      {/* Propositie */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-3 text-[var(--ink-4)]">Propositie</p>
        <p className="font-display text-xl font-bold leading-snug text-[var(--ink)]">
          TriFinity geeft je inzicht, grip en vooruitzicht op je financiële leven &mdash; alles op
          één plek, in één taal: tijd. Van nettovermogen tot vrijheidsprognose, van dagelijkse
          inzichten tot toekomstscenario&apos;s. Zonder dat je elke transactie hoeft bij te houden.
        </p>
      </section>

      {/* Emotioneel Verhaal */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">
          Het emotionele verhaal &mdash; &ldquo;Van weten naar worden&rdquo;
        </p>
        <p className="mb-6 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          Sommige mensen willen financieel onafhankelijk worden. Anderen willen gewoon weten waar
          ze staan en grip krijgen. TriFinity helpt beide &mdash; niet door je een spreadsheet te
          geven, maar door je financiën te vertalen naar iets dat je voelt:{' '}
          <strong className="font-semibold text-[var(--ink)]">hoeveel vrijheid heb je?</strong>
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* De Kern */}
          <div className="rounded-lg border-l-3 border-kern-500 bg-kern-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-kern-600">
              1. Ken je werkelijkheid
            </p>
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">De Kern</p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Wat bezit je, wat ben je schuldig, wat geef je uit? De Kern brengt alles samen: je
              nettovermogen in euro&apos;s, je vrijheidstijd in maanden en jaren, je budget als je
              dat wilt. Begin simpel of ga zo diep als je wilt.
            </p>
          </div>

          {/* De Wil */}
          <div className="rounded-lg border-l-3 border-wil-500 bg-wil-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-600">
              2. Neem de regie
            </p>
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">De Wil</p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              De Wil combineert jouw financiële data met AI om je te laten zien wat je nu kunt
              doen. Persoonlijke inzichten over je uitgaven, maar ook signalen van buiten:
              belastingwijzigingen, rentestand en marktontwikkelingen &mdash; vertaald naar impact
              op jou.
            </p>
          </div>

          {/* De Horizon */}
          <div className="rounded-lg border-l-3 border-horizon-500 bg-horizon-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-horizon-600">
              3. Zie je vrijheid groeien
            </p>
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">
              De Horizon
            </p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Of je doel nu &apos;grip krijgen&apos; of &apos;met 50 stoppen&apos; is &mdash; De
              Horizon laat je zien waar je naartoe gaat. What-if scenario&apos;s,
              levensgebeurtenissen, en je vrijheidsgetal dat maand na maand groeit.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
            <strong className="font-semibold not-italic text-[var(--ink)]">De belofte:</strong>{' '}
            TriFinity past zich aan jou aan. Wil je alleen overzicht? Dat is genoeg. Wil je actief
            sturen? De app helpt. Droom je van financiële vrijheid? Je ziet het naderen. In elke
            stap vertaalt TriFinity geld naar iets dat je begrijpt en voelt: <strong>tijd</strong>.
          </p>
        </div>
      </section>

      {/* Voor wie? — Persona's */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">Voor wie?</p>

        {/* Primary persona — full-width, elevated */}
        <div className="mb-6 rounded-xl border border-[var(--border-ed)] bg-gradient-to-br from-[var(--subtle)] to-[var(--paper)] p-6">
          <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Primaire doelgroep
          </p>
          <p className="mb-1 font-display text-lg font-bold text-[var(--ink)]">
            Voor iedereen
          </p>
          <p className="mb-1 font-serif text-sm font-medium text-[var(--ink-2)]">
            Voor iedereen die meer inzicht, grip en vooruitzicht wil
          </p>
          <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
            Je hoeft geen financieel expert te zijn. TriFinity is er voor iedereen die met een beetje
            inzicht en hulp meer uit z&apos;n geld &mdash; en z&apos;n tijd &mdash; wil halen.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              'Nettovermogen in één oogopslag',
              'Vrijheidsgetal \u2014 vermogen uitgedrukt in tijd',
              'Gepersonaliseerd dashboard',
              'Dagelijkse briefing met AI-inzichten',
              'Automatische bankimport',
            ].map((f) => (
              <span
                key={f}
                className="rounded-full bg-[var(--ink)]/8 px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-2)]"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Three persona cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Persona 1 — De pensioenplanner */}
          <div className="rounded-lg border-l-3 border-horizon-500 bg-horizon-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-horizon-600">
              Persona
            </p>
            <p className="mb-1 font-display text-sm font-semibold text-[var(--ink)]">
              De pensioenplanner
            </p>
            <p className="mb-1 font-serif text-xs font-medium text-[var(--ink-2)]">
              Geïnteresseerd in pensioen en financiële toekomst
            </p>
            <p className="mb-3 font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Wil weten of het pensioen genoeg is, wanneer eerder stoppen kan, en wat de impact is
              van extra inleggen.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'FIRE-prognose met AOW-integratie',
                'Pensioen in het vermogensoverzicht',
                'Levensgebeurtenissen doorrekenen',
                'What-if scenario\u2019s',
                'Onttrekkingsstrategie simulatie',
              ].map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-horizon-500/10 px-2.5 py-0.5 text-[11px] font-medium text-horizon-600"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Persona 2 — De vermogensverdeler */}
          <div className="rounded-lg border-l-3 border-kern-500 bg-kern-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-kern-600">
              Persona
            </p>
            <p className="mb-1 font-display text-sm font-semibold text-[var(--ink)]">
              De vermogensverdeler
            </p>
            <p className="mb-1 font-serif text-xs font-medium text-[var(--ink-2)]">
              Op zoek naar overzicht over bezittingen en schulden
            </p>
            <p className="mb-3 font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Wil alles bij elkaar zien: spaargeld, beleggingen, hypotheek, schulden &mdash; en
              begrijpen hoe het samenhangt.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Nettovermogen: bezittingen vs. schulden',
                'Beleggingsportefeuille & allocatie',
                'Hypotheek en schulden tracking',
                'Box 3 belastingberekening',
                'Vermogensontwikkeling over tijd',
              ].map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-kern-500/10 px-2.5 py-0.5 text-[11px] font-medium text-kern-600"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Persona 3 — De budgetteerder */}
          <div className="rounded-lg border-l-3 border-wil-500 bg-wil-50/50 p-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-600">
              Persona
            </p>
            <p className="mb-1 font-display text-sm font-semibold text-[var(--ink)]">
              De budgetteerder
            </p>
            <p className="mb-1 font-serif text-xs font-medium text-[var(--ink-2)]">
              Gedreven om grip te krijgen op uitgaven
            </p>
            <p className="mb-3 font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Wil weten waar het geld naartoe gaat, patronen herkennen, en bewust keuzes maken.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Bankimport (MT940/CAMT.053/CSV)',
                'Automatische categorisatie',
                'Budgetten per categorie',
                'Uitgavenpatronen en trends',
                'Abonnementen-inzicht',
              ].map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-wil-500/10 px-2.5 py-0.5 text-[11px] font-medium text-wil-600"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Mapping */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">Feature Mapping per Module</p>

        <div className="space-y-6">
          {/* Kern features */}
          <div>
            <p className="mb-2 font-sans text-xs font-bold text-kern-600">
              De Kern &mdash; &ldquo;Ken je werkelijkheid&rdquo;
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Nettovermogen', 'Bezittingen minus schulden, in euro\u2019s en vrijheidstijd'],
                ['Vermogen', 'Spaargeld, beleggingen, vastgoed, crypto, pensioen'],
                ['Schulden', 'Hypotheek, leningen, creditcard, studieschuld'],
                ['Transacties', 'Bankimport (MT940/CAMT.053/CSV), automatisch gecategoriseerd'],
                ['Budgetteren (optioneel)', 'Budgetten per categorie, maandoverzichten, trends — of werk met geschatte maanduitgaven'],
                ['Belastingpositie', 'Box 3 berekening, vermogensrendementsheffing'],
                ['Holdings', 'Beleggingsportefeuille: verdeling, rendement, allocatie'],
              ].map(([name, desc]) => (
                <div key={name} className="rounded border border-[var(--border-ed)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--ink)]">{name}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Wil features */}
          <div>
            <p className="mb-2 font-sans text-xs font-bold text-wil-600">
              De Wil &mdash; &ldquo;Neem de regie&rdquo;
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Gepersonaliseerd dashboard', 'Belangrijkste inzichten, aangepast aan jouw situatie'],
                ['Acties & aanbevelingen', 'Concrete stappen: bespaar, herfinancier, optimaliseer'],
                ['Doelen', 'Persoonlijke financiële doelen stellen en volgen'],
                ['Abonnementen-inzicht', 'Vaste lasten in kaart, bespaarkansen herkennen'],
                ['Patroonherkenning', 'Seizoenspatronen, trends, afwijkingen'],
                ['Nieuws x jouw situatie', 'Belasting, rente, markt \u2014 vertaald naar jouw impact'],
                ['AI-coach Will', 'Persoonlijke begeleiding per sovereignty level'],
              ].map(([name, desc]) => (
                <div key={name} className="rounded border border-[var(--border-ed)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--ink)]">{name}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Horizon features */}
          <div>
            <p className="mb-2 font-sans text-xs font-bold text-horizon-600">
              De Horizon &mdash; &ldquo;Zie je vrijheid groeien&rdquo;
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Vrijheidsprognose', 'FIRE-berekening met NL-specifieke parameters'],
                ['Aftellen', 'Vrijheidsgetal groeit \u2014 visueel, motiverend, maand na maand'],
                ['What-if scenario\u2019s', 'Meer sparen, minder uitgeven, huis kopen, ontslag?'],
                ['Levensgebeurtenissen', 'Kinderen, pensioen, erfenis, scheiding \u2014 impact op pad'],
                ['Droomscenario', 'Ideale leven uitwerken en doorrekenen'],
                ['Sparren', 'Met AI sparren over financiële strategieën'],
              ].map(([name, desc]) => (
                <div key={name} className="rounded border border-[var(--border-ed)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--ink)]">{name}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Differentiatie */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">
          Differentiatie &mdash; Waarom TriFinity?
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">
              Vrijheidstijd als taal
            </p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Andere apps tonen saldi en percentages. TriFinity vertaalt alles naar tijd: &ldquo;je
              hebt 2 jaar en 4 maanden vrijheid&rdquo;. Dit maakt geld emotioneel en begrijpelijk
              &mdash; voor iedereen.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">
              Data x AI x de wereld
            </p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              De driehoek: je data (bezit, uitgaven, inkomen), je voorkeuren (doelen, risico, fase)
              en de wereld (belasting, rente, markt). Geen andere app combineert alle drie.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
            <p className="mb-2 font-display text-sm font-semibold text-[var(--ink)]">
              Gebouwd voor Nederland
            </p>
            <p className="font-serif text-xs leading-relaxed text-[var(--ink-3)]">
              Box 3 vermogensrendementsheffing, AOW-integratie, hypotheekrenteaftrek,
              MT940/CAMT.053 bankimport. Tot in de kern Nederlands.
            </p>
          </div>
        </div>
      </section>

      {/* Aha-moment */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-3 text-[var(--ink-4)]">Het Aha-Moment</p>
        <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          De eerste 5 minuten van de app:
        </p>
        <ol className="mb-4 list-inside list-decimal space-y-1 font-serif text-sm text-[var(--ink-2)]">
          <li>Voer je spaargeld in (en eventueel hypotheek/schulden)</li>
          <li>Voer je maandelijkse uitgaven in (of schat ze)</li>
          <li>
            <strong className="font-semibold text-[var(--ink)]">
              Zie direct je vrijheidsgetal
            </strong>
            : &ldquo;Je hebt 1 jaar en 3 maanden vrijheid&rdquo;
          </li>
        </ol>
        <p className="rounded-lg border border-kern-200 bg-kern-50/50 px-4 py-3 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Dat getal &mdash; je vrijheid uitgedrukt in tijd &mdash; is het moment dat TriFinity van
          &ldquo;nog een finance app&rdquo; verandert in &ldquo;dit is voor mij.&rdquo;
        </p>
      </section>

      {/* Samenvatting */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">Samenvatting</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-[var(--border-ed)]">
              {[
                ['Filosofie', 'Geld is opgeslagen tijd'],
                [
                  'Propositie',
                  'Inzicht, grip en vooruitzicht op je financiële leven \u2014 alles op één plek, in één taal: tijd. Zonder dat je elke transactie hoeft bij te houden',
                ],
                [
                  'Doelgroep',
                  'Iedereen die meer inzicht, grip en vooruitzicht wil \u2014 van pensioenplanner tot budgetteerder',
                ],
                [
                  'Emotioneel frame',
                  'Van weten naar worden: bewustwording \u2192 empowerment \u2192 perspectief',
                ],
                [
                  'Drie pijlers',
                  'Kern (ken je werkelijkheid) \u2192 Wil (neem de regie) \u2192 Horizon (zie je vrijheid groeien)',
                ],
                [
                  'Gelaagdheid',
                  'Sovereignty = relevantie, Persona = diepte \u2014 twee onafhankelijke assen',
                ],
                ['Aha-moment', 'Je vrijheidsgetal in < 5 minuten'],
                [
                  'Differentiatie',
                  'Vrijheidstijd als taal + Data x AI x Wereld + 100% Nederlands',
                ],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="whitespace-nowrap py-2 pr-4 font-semibold text-[var(--ink)]">
                    {label}
                  </td>
                  <td className="py-2 text-[var(--ink-2)]">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
