/**
 * /toekomst/whatif rekende een afnemend of oplopend onttrekkingsprofiel als Vast
 * (vervolg op B-042, gevonden 11 sep 2026).
 *
 * WAT ER MISGING: de what-if-pagina haalde `withdrawal_profile_config` niet op, en
 * `buildWhatifKernelAdapterInput` mapte de kolom bewust niet ("bedradingsgat →
 * Excel-defaults"). De kernel-adapter leest het actieve profiel via
 * `resolveWithdrawalProfiel`: config-profiel wint, anders de enum. De enum kent
 * alleen 'static'/'guardrails', dus elk afnemend of oplopend plan viel stil terug op
 * Vast — én op de Excel-fasecurve. Dezelfde klasse als het stop-anker in ADR 0129 D3:
 * wat op de hoofdlijn is gekozen, moet op het what-if-pad meereizen, anders vergelijkt
 * de gebruiker twee verschillende plannen.
 *
 * DE NORM: het gekozen profiel en zijn fasegrenzen reizen mee, zodat what-if zonder
 * scenariowijziging hetzelfde plan rekent als /toekomst.
 *
 * Twee lagen, zoals de zusters in deze map: (1) de adapter-keten op de echte functies;
 * (2) een bron-grendel op de pagina-bedrading (de pagina is een groot client-component
 * aan de kernel-bundel en wordt niet gerenderd in de test).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWhatifKernelAdapterInput, type WhatifRawProfileRow } from '@/lib/horizon-kernel/adapter/whatif-varianten'
import { buildOnttrekkingsprofiel } from '@/lib/horizon-kernel/adapter/params'

/** Profiel zoals de onboarding het wegschrijft: enum 'static' + expliciet profiel. */
const AFNEMEND_PROFIEL: WhatifRawProfileRow = {
  date_of_birth: '1986-01-01',
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  withdrawal_strategy: 'static',
  withdrawal_profile_config: { profiel: 'afnemend', gogo_tot_leeftijd: 71 },
}

describe('what-if — het gekozen onttrekkingsprofiel reist mee', () => {
  it('Given enum static + profiel afnemend, When de what-if-input wordt gebouwd, Then rekent de kernel Afnemend', () => {
    const out = buildWhatifKernelAdapterInput({
      profile: AFNEMEND_PROFIEL,
      assets: [],
      debts: [],
      lifeEvents: [],
    })

    expect(buildOnttrekkingsprofiel(out.profile).profiel).toBe('Afnemend')
  })

  it('Given een eigen go-go-grens, When de what-if-input wordt gebouwd, Then geldt die grens en niet de Excel-default', () => {
    const out = buildWhatifKernelAdapterInput({
      profile: AFNEMEND_PROFIEL,
      assets: [],
      debts: [],
      lifeEvents: [],
    })

    expect(buildOnttrekkingsprofiel(out.profile).fase1TotLeeftijd).toBe(71)
  })

  it('Given een profiel zonder config, When de what-if-input wordt gebouwd, Then blijft Vast de uitkomst', () => {
    const out = buildWhatifKernelAdapterInput({
      profile: { ...AFNEMEND_PROFIEL, withdrawal_profile_config: undefined },
      assets: [],
      debts: [],
      lifeEvents: [],
    })

    expect(buildOnttrekkingsprofiel(out.profile).profiel).toBe('Vast')
  })
})

describe('what-if — bron-grendel op de profiel-ophaal', () => {
  it('de pagina haalt withdrawal_profile_config op naast de enum', () => {
    const bron = readFileSync(
      join(process.cwd(), 'app/(app)/horizon/whatif/whatif-page-client.tsx'),
      'utf8',
    )

    // Wie de enum ophaalt maar de config niet, krijgt stil Vast terug.
    expect(bron).toMatch(/withdrawal_strategy/)
    expect(bron).toMatch(/withdrawal_profile_config/)
  })
})
