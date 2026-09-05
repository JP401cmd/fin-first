'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

import { useOptionalToast } from '@/components/app/toast-provider'
import { quickAdd } from '@/app/actions/quick-add'
import {
  ASSET_QUICK_ADD_LABELS,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_ICONS,
  LINKED_DEBT_SUGGESTIONS,
  type AssetType,
} from '@/lib/asset-data'
import { ASSET_AMOUNT_CONFIRM_THRESHOLD } from '@/lib/asset-parameter-bands'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import {
  DEBT_QUICK_ADD_LABELS,
  DEBT_TYPE_COLORS,
  DEBT_TYPE_ICONS,
  type DebtType,
} from '@/lib/debt-data'
import type {
  AssetQuickInput,
  DebtQuickInput,
  QuickAddInput,
  QuickAddIntent,
} from '@/lib/quick-add/types'
import {
  initialWizardState,
  wizardReducer,
  type AssetDraftState,
  type DebtDraftState,
  type WizardState,
} from './wizard-reducer'
import { TypeIcon } from './icon-map'
import { StepHeader } from './step-header'
import { StepChoice } from './steps/step-choice'
import { StepType } from './steps/step-type'
import { StepDetails } from './steps/step-details'
import { StepLinkDebt } from './steps/step-link-debt'
import { StepHousingChoice } from './steps/step-housing-choice'
import type { HousingChoice } from '@/lib/housing-choice'
import { MaskedAmount } from '@/components/app/masked-amount'
import { MilestoneCelebration } from '@/components/app/milestone-celebration'

/**
 * QuickAddWizard — 4-staps flow in een BottomSheet.
 *
 * State-machine zit in `wizardReducer`; deze component is de host die
 * stappen rendert, de server action aanroept en toast/router-side-effects
 * verzorgt. De wizard ondersteunt drie paden:
 *   · asset-only (stap 1 → 2 → 3 → success)
 *   · debt-only (stap 1 → 2 → 3 → success)
 *   · asset + gekoppelde schuld (stap 1 → 2 → 3 → 4 prompt → 4 form → success)
 *
 * Bij `initialIntent` wordt stap 1 overgeslagen — dit pad wordt gebruikt
 * door `QuickAddTrigger` op `/core` en de empty-state op de detail-pagina's.
 *
 * Het asset-with-debt-pad wordt in twee fasen opgeslagen: eerst de asset
 * (zodat `linked_asset_id` beschikbaar is), daarna — bij "Ja, schuld
 * toevoegen" — de debt. Als de gebruiker "Nee" kiest, blijft alleen de
 * asset bestaan. De Server Action lost dit idempotent op.
 */

export interface QuickAddWizardProps {
  open: boolean
  onClose: () => void
  initialIntent?: QuickAddIntent
  /**
   * Optionele type-prefill — wordt alleen toegepast als hij past bij
   * `initialIntent`. Skipt stap 2 (type-keuze) zodat de wizard direct het
   * details-formulier toont. Gebruikt op categorie-pagina's, waar de
   * gebruiker al gekozen heeft welke categorie hij toevoegt (bv. hypotheek
   * op `/core/debts/mortgage`).
   */
  initialAssetType?: AssetType
  initialDebtType?: DebtType
  /**
   * Voor-ingevuld `linked_asset_id` voor het debt-pad. Alleen zinvol samen met
   * `initialIntent='debt'` + `initialDebtType` — gebruikt door de "Heeft deze
   * woning een hypotheek?"-vervolg-CTA in de volledige AssetForm zodat de
   * zojuist-aangemaakte eigen woning meteen aan de hypotheek wordt gekoppeld.
   */
  initialLinkedAssetId?: string
  /**
   * Twee operatie-modi:
   *   · `commit` (default) — schrijft direct via de `quickAdd` Server Action
   *     en navigeert / verfrist na succes. Gebruikt op `/core` en de
   *     categorie-detail-pagina's.
   *   · `collect` — slaat NIETS op; geeft het verzamelde item door via
   *     `onCollect` zodat een parent (bv. onboarding) het in eigen lokale
   *     state kan houden tot een batch-submit. In deze modus wordt de
   *     gekoppelde-schuld-prompt overgeslagen — een onboarding-gebruiker
   *     voegt asset en debt apart toe.
   */
  mode?: 'commit' | 'collect'
  onCollect?: (item: QuickAddInput) => void
  onSaved?: (result: { assetId?: string; debtId?: string }) => void
  /**
   * Aantal bezittingen dat de gebruiker had vóór deze wizard-sessie. Wanneer dit
   * exact 0 is en er hier een bezitting bijkomt (commit-mode), viert de wizard
   * eenmalig de mijlpaal "je eerste bezitting". De waarde wordt bij openen
   * bevroren, zodat een `router.refresh()` ná de insert het signaal niet vertroebelt.
   * Optioneel: consumers die geen betrouwbare telling hebben laten 'm weg — dan
   * viert de wizard niet (liever geen viering dan een onterechte).
   */
  assetCountBefore?: number
}

/**
 * Parallel-state voor de koppel-schuld-flow. De wizard-reducer modelleert
 * `linkDebt` wel, maar we kunnen die transitie pas betrouwbaar uitvoeren
 * nadat de server de asset heeft opgeslagen (en dus `savedAssetId` heeft
 * teruggegeven). Dit object draagt de context tussen stap 4a (prompt) en
 * stap 4b (debt-form).
 */
type LinkDebtContext =
  | null
  | {
      phase: 'prompt'
      asset: AssetQuickInput
      /**
       * Het zojuist-opgeslagen asset-id (commit-mode), of `null` in collect-mode
       * (onboarding) waar de asset nog niet gepersisteerd is. In collect-mode
       * dragen we het huis + de hypotheek als lokaal paar door via `onCollect`
       * en koppelt de server ze na batch-insert (`linked_client_ref`).
       */
      savedAssetId: string | null
    }
  | {
      phase: 'form'
      asset: AssetQuickInput
      savedAssetId: string | null
      debtDraft: DebtDraftState
    }

/**
 * Openstaande woning-vraag (ADR 0133) — de afsluitende stap ná de
 * hypotheek-vraag, voor wie zijn EERSTE eigen woning toevoegt.
 *
 * Draagt het success-scherm mee dat zonder deze stap direct getoond zou zijn:
 * de bezitting is op dit punt al opgeslagen, dus welke uitweg de gebruiker ook
 * kiest (bevestigen, overslaan, of een mislukte PUT), we eindigen altijd op
 * exact dát scherm. De vraag mag het toevoegen nooit alsnog laten mislukken.
 */
type HousingAskState = {
  pendingSuccess: Extract<WizardState, { step: 'success' }>
  choice: HousingChoice | null
  isSaving: boolean
  error: string | null
}

const HOUSING_SAVE_ERROR =
  'Je keuze is niet opgeslagen — je woning staat er wel gewoon in. Probeer het opnieuw of stel het later in bij Voorkeuren.'

export function QuickAddWizard({
  open,
  onClose,
  initialIntent,
  initialAssetType,
  initialDebtType,
  initialLinkedAssetId,
  mode = 'commit',
  onCollect,
  onSaved,
  assetCountBefore,
}: QuickAddWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)
  const [isSaving, setIsSaving] = useState(false)
  const [linkDebtCtx, setLinkDebtCtx] = useState<LinkDebtContext>(null)
  /**
   * Openstaande plausibiliteitsvraag bij een groot bedrag (H8). Draagt de
   * complete draft mee, zodat "Ja, dit klopt" exact hetzelfde pad hervat dat
   * de vraag onderbrak — inclusief de koppel-prompt voor types met een
   * schuldsuggestie. `bedragBevestigdRef` houdt het bevestigde bedrag vast
   * zodat de vraag bij een dáárna gewijzigde waarde opnieuw komt.
   */
  const [bedragBevestiging, setBedragBevestiging] = useState<
    { bedrag: number; draft: AssetDraftState } | null
  >(null)
  const bedragBevestigdRef = useRef<number | null>(null)
  // Mijlpaal "eerste bezitting": bevries de telling bij openen (zie prop-doc) en
  // toon de viering zodra er in commit-mode een bezitting bijkomt vanaf nul.
  const assetCountAtOpenRef = useRef<number | undefined>(assetCountBefore)
  const [celebrateFirstAsset, setCelebrateFirstAsset] = useState(false)
  /**
   * Woning-vraag (ADR 0133): openstaande stap + de lopende relevantie-lezing.
   *
   * De lezing start bewust VÓÓR de insert (in `proceedFromAssetDetails`) en
   * wordt als promise bewaard: ná het opslaan heeft élke gebruiker een eigen
   * woning, dus dán is niet meer te zien of hij er al één hád. Alleen wie er
   * nog geen had én de vraag nog niet beantwoordde, krijgt 'm — anders zou een
   * tweede woning de keuze bij de eerste overschrijven.
   */
  const [housingAsk, setHousingAsk] = useState<HousingAskState | null>(null)
  const housingProbeRef = useRef<Promise<boolean> | null>(null)
  // Optionele toast: wizard wordt ook in onboarding-layout gebruikt waar geen
  // ToastProvider zit. In collect-mode roepen we addToast toch niet aan; in
  // commit-mode is de provider altijd aanwezig (app-shell).
  const { addToast } = useOptionalToast()
  const router = useRouter()
  const isCollectMode = mode === 'collect'

  // Type-prefill is alleen actief wanneer hij past bij intent — dezelfde
  // soft-fail-regel als in de reducer. We berekenen 'm hier opnieuw zodat
  // step-counters en back-knop-zichtbaarheid synchroon lopen met de state.
  const hasTypePrefill =
    (initialIntent === 'asset' && Boolean(initialAssetType)) ||
    (initialIntent === 'debt' && Boolean(initialDebtType))

  // Spiegel de prop in een render-ref zodat het open-effect 'm kan lezen
  // zónder erop te dependeren: na een succesvolle save streamt router.refresh()
  // een nieuwe telling het component in, en mét de prop in de dep-array zou
  // dat het open-effect her-triggeren — OPEN-reset wist dan het success-scherm
  // en kapt de viering af.
  const assetCountBeforeRef = useRef(assetCountBefore)
  assetCountBeforeRef.current = assetCountBefore

  // Open/reset — sync met de `open`-prop uit de parent. Bij heropening
  // starten we schoon (OPEN action met optionele intent + type-prefill).
  useEffect(() => {
    // De bedrag-bevestiging (H8) hoort bij één ingevoerde bezitting, niet bij
    // de wizard: laat je 'm staan, dan slaat een volgende invoer met exact
    // hetzelfde bedrag de wedervraag over.
    setBedragBevestiging(null)
    bedragBevestigdRef.current = null
    // De woning-vraag hoort net zo goed bij één ingevoerde bezitting: bij
    // heropenen moet de relevantie opnieuw gelezen worden (er kán inmiddels
    // een woning bijgekomen zijn, of de vraag kan elders beantwoord zijn).
    setHousingAsk(null)
    housingProbeRef.current = null
    if (open) {
      dispatch({
        type: 'OPEN',
        initialIntent,
        initialAssetType,
        initialDebtType,
        initialLinkedAssetId,
      })
      setLinkDebtCtx(null)
      setIsSaving(false)
      setCelebrateFirstAsset(false)
      // Bevries de bezittings-telling zoals die was bij openen — de bron van het
      // "eerste bezitting"-signaal, immuun voor de latere router.refresh().
      assetCountAtOpenRef.current = assetCountBeforeRef.current
    } else {
      dispatch({ type: 'RESET' })
      setLinkDebtCtx(null)
      setIsSaving(false)
      setCelebrateFirstAsset(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assetCountBefore bewust via ref (zie boven)
  }, [open, initialIntent, initialAssetType, initialDebtType, initialLinkedAssetId])

  // Mijlpaal-detectie op één plek: zodra we een success-scherm tonen met een
  // nieuw toegevoegde bezitting (asset of asset_with_debt), commit-mode, en de
  // bevroren telling exact 0 was, markeren we de viering. De MilestoneCelebration
  // zelf bewaakt de once-guard (localStorage), dus dit vlagje mag ruim staan.
  useEffect(() => {
    if (state.step !== 'success' || isCollectMode) return
    if (assetCountAtOpenRef.current !== 0) return
    if (state.kind === 'asset' || state.kind === 'asset_with_debt') {
      setCelebrateFirstAsset(true)
    }
  }, [state, isCollectMode])

  // Stappen-totaal: choice + type + details + linkDebt = 4. Skip choice
  // bij `initialIntent` (-1), skip ook type bij type-prefill (-1).
  const totalSteps = hasTypePrefill ? 2 : initialIntent ? 3 : 4

  // ── Woning-vraag (ADR 0133) ────────────────────────────────────

  /**
   * Start de relevantie-lezing voor de woning-vraag. Aangeroepen op het moment
   * dat de gebruiker zijn woning-details indient — dus vóór de insert, want ná
   * de insert zegt de route altijd `has_eigen_huis: true` en is niet meer te
   * zien of dit zijn eerste woning was.
   *
   * De vraag is alleen relevant wanneer er nog géén eigen woning was ÉN de
   * keuze nog niet gemaakt is (`choice === null`, de DB-default `include_full`).
   * Een leesfout (500/netwerk) telt bewust als "niet vragen": een 500 is géén
   * bewijs dat er geen woning is, en doorvragen zou de keuze bij een bestaande
   * woning kunnen overschrijven. De gebruiker houdt dan wat hij had en kan het
   * in Voorkeuren zetten.
   */
  const startHousingProbe = useCallback(() => {
    if (housingProbeRef.current) return
    housingProbeRef.current = (async () => {
      try {
        const res = await fetch('/api/housing-strategy', {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) return false
        const data = (await res.json()) as {
          has_eigen_huis?: boolean
          choice?: HousingChoice | null
        }
        return data.has_eigen_huis === false && (data.choice ?? null) === null
      } catch {
        return false
      }
    })()
  }, [])

  /**
   * Toon het success-scherm — of eerst de woning-vraag, wanneer die openstaat.
   * Alle commit-paden die op "toegevoegd" uitkomen lopen hierlangs; zonder
   * lopende lezing (elk ander type, elke collect-flow) is dit een directe
   * `SUCCESS`-dispatch.
   */
  const showSuccess = useCallback(
    async (payload: Extract<WizardState, { step: 'success' }>) => {
      const probe = housingProbeRef.current
      if (probe) {
        const shouldAsk = await probe
        housingProbeRef.current = null
        if (shouldAsk) {
          setHousingAsk({
            pendingSuccess: payload,
            choice: null,
            isSaving: false,
            error: null,
          })
          return
        }
      }
      dispatch({ type: 'SUCCESS', payload })
    },
    [],
  )

  // ── Submit: asset-only of debt-only ────────────────────────────

  const submitQuickAdd = useCallback(
    async (input: QuickAddInput) => {
      // Collect-mode: alleen verzamelen, geen DB-write. De parent krijgt het
      // item via `onCollect` en bewaart het tot een batch-submit (onboarding).
      if (isCollectMode) {
        dispatch({
          type: 'SUCCESS',
          payload: {
            step: 'success',
            kind: input.kind,
            assetName: input.kind !== 'debt' ? input.asset.name : undefined,
            debtName:
              input.kind === 'asset_with_debt' ? input.debt.name : undefined,
            netAmount:
              input.kind === 'asset_with_debt'
                ? input.asset.current_value - input.debt.current_balance
                : undefined,
          },
        })
        onCollect?.(input)
        return
      }

      setIsSaving(true)
      dispatch({ type: 'SAVING' })

      try {
        const result = await quickAdd(input)

        if (result.ok) {
          const name = input.kind === 'debt' ? input.debt.name : input.asset.name

          addToast({ type: 'success', title: `${name} toegevoegd.`, duration: 3000 })
          router.refresh()
          onSaved?.({ assetId: result.assetId, debtId: result.debtId })

          await showSuccess({
            step: 'success',
            kind: input.kind,
            assetName: input.kind !== 'debt' ? input.asset.name : undefined,
            debtName:
              input.kind === 'asset_with_debt' ? input.debt.name : undefined,
            netAmount:
              input.kind === 'asset_with_debt'
                ? input.asset.current_value - input.debt.current_balance
                : undefined,
          })
        } else if (
          result.code === 'DEBT_FAILED' &&
          result.partial?.assetId &&
          input.kind === 'asset_with_debt'
        ) {
          addToast({
            type: 'warning',
            title: 'Bezitting opgeslagen, schuld mislukt.',
            message: result.message,
            duration: 6000,
          })
          router.refresh()
          onSaved?.({ assetId: result.partial.assetId })
          await showSuccess({
            step: 'success',
            kind: 'asset',
            assetName: input.asset.name,
          })
        } else {
          dispatch({ type: 'ERROR', message: result.message })
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Opslaan mislukt — probeer opnieuw.'
        dispatch({ type: 'ERROR', message })
      } finally {
        setIsSaving(false)
      }
    },
    [isCollectMode, onCollect, addToast, onSaved, router, showSuccess],
  )

  // ── Asset-details → linkDebt prompt OR submit ──────────────────

  const proceedFromAssetDetails = useCallback(
    async (draft: AssetDraftState) => {
      if (typeof draft.current_value !== 'number' || !draft.name) return

      // ── Plausibiliteitsvraag bij een groot bedrag (H8, optie B) ───────────
      //
      // Geen blokkade maar een vraag — een harde cap zou een legitieme
      // UHNW-gebruiker buitensluiten. De check staat vóór élke vertakking
      // hieronder, zodat commit-modus én collect-modus (onboarding) er allebei
      // doorheen lopen. `bedragBevestigdRef` onthoudt het exact bevestigde
      // bedrag, zodat een daarna gewijzigde waarde opnieuw doorgevraagd wordt.
      if (
        draft.current_value >= ASSET_AMOUNT_CONFIRM_THRESHOLD &&
        bedragBevestigdRef.current !== draft.current_value
      ) {
        setBedragBevestiging({ bedrag: draft.current_value, draft })
        return
      }

      // ── Woning-vraag: lees de relevantie NU, vóór de insert (ADR 0133) ───
      //
      // Dit is het laatste moment waarop de app weet of de gebruiker al een
      // eigen woning hád: één regel verderop wordt die er hoe dan ook één. De
      // lezing loopt parallel aan het opslaan; het antwoord is pas nodig op het
      // moment dat het success-scherm zou verschijnen (`showSuccess`).
      //
      // Alleen commit-mode: in collect-mode (onboarding) stelt de onboarding
      // zelf deze vraag en is er nog niets om tegen te lezen.
      if (draft.asset_type === 'eigen_huis' && !isCollectMode) {
        startHousingProbe()
      }

      const complete: AssetQuickInput = {
        asset_type: draft.asset_type,
        name: draft.name.trim(),
        current_value: draft.current_value,
        field3: draft.field3 ?? null,
        // Savings-only rente-veld; leeg voor andere types (buildAssetDraft
        // valt dan terug op de TYPICAL_RETURNS-default).
        expected_return: draft.expected_return ?? null,
      }

      // Beide modi tonen de gekoppelde-schuld-prompt voor asset-types met een
      // suggestie (bv. "Heeft deze woning een hypotheek?" bij eigen_huis).
      const suggestsDebt = LINKED_DEBT_SUGGESTIONS[draft.asset_type]
      if (!suggestsDebt) {
        await submitQuickAdd({ kind: 'asset', asset: complete })
        return
      }

      // Collect-mode (onboarding): NIET opslaan. Het huis heeft nog geen DB-id;
      // we tonen de prompt en dragen huis + hypotheek straks als lokaal paar
      // door via `onCollect` (`asset_with_debt`). De server koppelt na insert.
      if (isCollectMode) {
        setLinkDebtCtx({ phase: 'prompt', asset: complete, savedAssetId: null })
        return
      }

      // Commit-mode: asset vooraf opslaan zodat we in de debt-stap een
      // `linked_asset_id` hebben. Bij een fail vallen we terug op het error-scherm.
      setIsSaving(true)
      dispatch({ type: 'SAVING' })
      try {
        const result = await quickAdd({ kind: 'asset', asset: complete })
        if (result.ok && result.assetId) {
          addToast({
            type: 'success',
            title: `${complete.name} toegevoegd.`,
            duration: 3000,
          })
          router.refresh()
          onSaved?.({ assetId: result.assetId })
          setLinkDebtCtx({
            phase: 'prompt',
            asset: complete,
            savedAssetId: result.assetId,
          })
        } else {
          const message = result.ok ? 'Opslaan mislukt' : result.message
          dispatch({ type: 'ERROR', message })
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Opslaan mislukt — probeer opnieuw.'
        dispatch({ type: 'ERROR', message })
      } finally {
        setIsSaving(false)
      }
    },
    [isCollectMode, addToast, onSaved, router, submitQuickAdd, startHousingProbe],
  )

  // ── Debt-details (stand-alone of gekoppeld) ────────────────────

  const proceedFromDebtDetails = useCallback(
    (draft: DebtDraftState, linkedAssetId?: string) => {
      if (typeof draft.current_balance !== 'number' || !draft.name) return
      const complete: DebtQuickInput = {
        debt_type: draft.debt_type,
        name: draft.name.trim(),
        current_balance: draft.current_balance,
        field3: draft.field3 ?? null,
        // Hypotheek-only extra's; leeg voor andere types (buildDebtDraft
        // valt dan terug op de type-defaults).
        repayment_type: draft.repayment_type ?? null,
        start_date: draft.start_date ?? null,
        // Hypotheek-only: resterende looptijd in jaren. Leeg ⇒ buildDebtDraft
        // valt terug op DEFAULT_TERM_YEARS_PER_TYPE.
        term_years: draft.term_years ?? null,
        // Looptijd-leningen-only: werkelijke aflossing per maand (optioneel).
        monthly_payment: draft.monthly_payment ?? null,
        linked_asset_id: linkedAssetId ?? draft.linked_asset_id ?? null,
      }
      void submitQuickAdd({ kind: 'debt', debt: complete })
    },
    [submitQuickAdd],
  )

  // ── LinkDebt: ja/nee ───────────────────────────────────────────

  const handleLinkDebtYes = useCallback(() => {
    if (!linkDebtCtx || linkDebtCtx.phase !== 'prompt') return
    const suggested = LINKED_DEBT_SUGGESTIONS[linkDebtCtx.asset.asset_type]
    if (!suggested) return
    setLinkDebtCtx({
      phase: 'form',
      asset: linkDebtCtx.asset,
      savedAssetId: linkDebtCtx.savedAssetId,
      debtDraft: {
        debt_type: suggested,
        name: deriveCoupledDebtName(linkDebtCtx.asset.asset_type, linkDebtCtx.asset.name),
      },
    })
  }, [linkDebtCtx])

  const handleLinkDebtNo = useCallback(() => {
    if (!linkDebtCtx) return
    // Collect-mode: het huis is nog NIET verzameld (we sloegen de submit over om
    // de prompt te tonen). "Nee" betekent: alleen het huis doorgeven, zonder
    // hypotheek. Huis zonder hypotheek blijft een geldige keuze.
    if (linkDebtCtx.savedAssetId === null) {
      void submitQuickAdd({ kind: 'asset', asset: linkDebtCtx.asset })
      setLinkDebtCtx(null)
      return
    }
    // Commit-mode: asset is al opgeslagen vóór de prompt — toon success
    // (of eerst de woning-vraag, wanneer die openstaat).
    void showSuccess({
      step: 'success',
      kind: 'asset',
      assetName: linkDebtCtx.asset.name,
    })
    setLinkDebtCtx(null)
  }, [linkDebtCtx, submitQuickAdd, showSuccess])

  const handleLinkDebtFormUpdate = useCallback((patch: Partial<DebtQuickInput>) => {
    setLinkDebtCtx((prev) =>
      prev && prev.phase === 'form'
        ? { ...prev, debtDraft: { ...prev.debtDraft, ...patch } }
        : prev,
    )
  }, [])

  const handleLinkDebtFormSubmit = useCallback(() => {
    if (!linkDebtCtx || linkDebtCtx.phase !== 'form') return
    const { debtDraft, savedAssetId, asset } = linkDebtCtx
    // Commit-mode: asset is al opgeslagen → koppel de schuld via linked_asset_id.
    if (savedAssetId) {
      proceedFromDebtDetails(debtDraft, savedAssetId)
      setLinkDebtCtx(null)
      return
    }
    // Collect-mode: geef huis + hypotheek als één paar door. De onboarding-
    // parent koppelt ze lokaal (client_ref) en de server zet na insert het
    // echte linked_asset_id. We forwarden alleen geldige debt-input.
    if (
      typeof debtDraft.current_balance === 'number' &&
      debtDraft.name &&
      debtDraft.name.trim().length > 0
    ) {
      void submitQuickAdd({
        kind: 'asset_with_debt',
        asset,
        debt: {
          debt_type: debtDraft.debt_type,
          name: debtDraft.name.trim(),
          current_balance: debtDraft.current_balance,
          field3: debtDraft.field3 ?? null,
          // Hypotheek-only extra's — een gekoppelde hypotheek (bv. bij een
          // eigen woning) krijgt dezelfde aflossingsvorm/ingangsdatum-velden.
          repayment_type: debtDraft.repayment_type ?? null,
          start_date: debtDraft.start_date ?? null,
          // Looptijd-leningen-only (bv. autolening bij een voertuig):
          // werkelijke aflossing per maand (optioneel).
          monthly_payment: debtDraft.monthly_payment ?? null,
        },
      })
    }
    setLinkDebtCtx(null)
  }, [linkDebtCtx, proceedFromDebtDetails, submitQuickAdd])

  // ── Close / navigation ─────────────────────────────────────────

  const handleClose = useCallback(() => {
    setLinkDebtCtx(null)
    // Sluiten met de woning-vraag open = overslaan. De bezitting staat er al;
    // de keuze blijft bereikbaar in Voorkeuren.
    setHousingAsk(null)
    onClose()
  }, [onClose])

  const handleBack = useCallback(() => {
    if (linkDebtCtx?.phase === 'form') {
      // Terug naar de prompt.
      setLinkDebtCtx({
        phase: 'prompt',
        asset: linkDebtCtx.asset,
        savedAssetId: linkDebtCtx.savedAssetId,
      })
      return
    }
    if (linkDebtCtx?.phase === 'prompt') {
      // Collect-mode: asset is nog NIET opgeslagen → terug naar het details-
      // formulier (reducer-state staat nog op 'details', draft intact).
      if (linkDebtCtx.savedAssetId === null) {
        setLinkDebtCtx(null)
        return
      }
      // Commit-mode: asset is al opgeslagen — teruggaan naar details zou
      // verwarrend zijn; we sluiten de koppel-flow en tonen het success-scherm.
      void showSuccess({
        step: 'success',
        kind: 'asset',
        assetName: linkDebtCtx.asset.name,
      })
      setLinkDebtCtx(null)
      return
    }
    dispatch({ type: 'BACK' })
  }, [linkDebtCtx, showSuccess])

  const handleAddAnother = useCallback(() => {
    setLinkDebtCtx(null)
    // Zie het open-effect: de bevestiging geldt per ingevoerde bezitting.
    setBedragBevestiging(null)
    bedragBevestigdRef.current = null
    // Idem de woning-vraag: een volgende bezitting leest 'm opnieuw (en krijgt
    // 'm dan niet meer — er is nu een woning).
    setHousingAsk(null)
    housingProbeRef.current = null
    dispatch({ type: 'ADD_ANOTHER' })
  }, [])

  // ── Woning-vraag: bevestigen / overslaan ───────────────────────

  const handleHousingChange = useCallback((choice: HousingChoice) => {
    setHousingAsk((prev) => (prev ? { ...prev, choice } : prev))
  }, [])

  /**
   * Sla de keuze op via de route (`PUT /api/housing-strategy`, alleen `choice` —
   * `lib/housing-choice.ts` maakt er server-side de config van) en rond af.
   *
   * Mislukt de PUT, dan blijft de bezitting gewoon bestaan: we tonen de fout in
   * de stap en laten "Overslaan" open staan. De woning toevoegen mag nooit
   * mislukken omdat een vervolgvraag misging.
   */
  const handleHousingConfirm = useCallback(async () => {
    const current = housingAsk
    if (!current || current.choice === null || current.isSaving) return
    setHousingAsk({ ...current, isSaving: true, error: null })
    try {
      const res = await fetch('/api/housing-strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: current.choice }),
      })
      if (!res.ok) {
        setHousingAsk({ ...current, isSaving: false, error: HOUSING_SAVE_ERROR })
        return
      }
      setHousingAsk(null)
      dispatch({ type: 'SUCCESS', payload: current.pendingSuccess })
      // De keuze verschuift de vrijheids-grondslag (mét/zonder je huis), dus de
      // server components eromheen moeten opnieuw lezen.
      router.refresh()
    } catch {
      setHousingAsk({ ...current, isSaving: false, error: HOUSING_SAVE_ERROR })
    }
  }, [housingAsk, router])

  const handleHousingSkip = useCallback(() => {
    if (!housingAsk) return
    const payload = housingAsk.pendingSuccess
    setHousingAsk(null)
    dispatch({ type: 'SUCCESS', payload })
  }, [housingAsk])

  // ── Dispatch wrappers ──────────────────────────────────────────

  const selectIntent = useCallback(
    (intent: QuickAddIntent) => dispatch({ type: 'SELECT_INTENT', intent }),
    [],
  )

  const selectType = useCallback(
    (type: AssetType | DebtType) => {
      if (state.step !== 'type') return
      if (state.intent === 'asset') {
        dispatch({ type: 'SELECT_TYPE_ASSET', assetType: type as AssetType })
      } else {
        dispatch({ type: 'SELECT_TYPE_DEBT', debtType: type as DebtType })
      }
    },
    [state],
  )

  const updateAsset = useCallback(
    (patch: Partial<AssetQuickInput>) => dispatch({ type: 'UPDATE_ASSET', patch }),
    [],
  )

  const updateDebt = useCallback(
    (patch: Partial<DebtQuickInput>) => dispatch({ type: 'UPDATE_DEBT', patch }),
    [],
  )

  // ── Render ─────────────────────────────────────────────────────

  // De woning-vraag is een eigen stap bovenop de state-machine (net als de
  // koppel-schuld-flow) en overschrijft daarom titel + hoogte van de sheet.
  const sheetTitle = housingAsk
    ? 'Je woning'
    : deriveSheetTitle(state, linkDebtCtx, initialIntent)
  const sheetHeight = housingAsk ? '70vh' : deriveSheetHeight(state, linkDebtCtx)

  return (
    <>
      {/* `suspended` en niet `open={false}`: de wedervraag hieronder is een
          tweede overlay bovenop deze sheet, en beide luisteren naar Escape.
          Zonder terugtreden sloot één toetsaanslag ze allebei — met de getypte
          naam en het bedrag erin, want een gesloten BottomSheet rendert `null`
          en neemt de hele wizard-boom mee. Terugtreden houdt die boom gemount
          én geeft Escape aan het bovenste venster (M35-mechaniek). */}
      <BottomSheet
        open={open}
        onClose={handleClose}
        title={sheetTitle}
        size="md"
        initialMobileHeight={sheetHeight}
        suspended={bedragBevestiging !== null}
      >
        <div className="p-5 sm:p-6">
          <WizardContent
            state={state}
            linkDebtCtx={linkDebtCtx}
            housingAsk={housingAsk}
            totalSteps={totalSteps}
            initialIntent={initialIntent}
            hasTypePrefill={hasTypePrefill}
            showStepCount={!isCollectMode}
            isSaving={isSaving}
            requireLinkedAsset={!isCollectMode}
            onBack={handleBack}
            onSelectIntent={selectIntent}
            onSelectType={selectType}
            onUpdateAsset={updateAsset}
            onUpdateDebt={updateDebt}
            onProceedAssetDetails={() => {
              if (state.step === 'details' && state.intent === 'asset') {
                void proceedFromAssetDetails(state.assetDraft)
              }
            }}
            onProceedDebtDetails={() => {
              if (state.step === 'details' && state.intent === 'debt') {
                // `linkedAssetId` is gezet wanneer de wizard met een voor-ingevuld
                // koppel-id is geopend (hypotheek-vervolg-CTA op een nieuwe woning).
                proceedFromDebtDetails(state.debtDraft, state.linkedAssetId)
              }
            }}
            onLinkDebtYes={handleLinkDebtYes}
            onLinkDebtNo={handleLinkDebtNo}
            onLinkDebtFormUpdate={handleLinkDebtFormUpdate}
            onLinkDebtFormSubmit={handleLinkDebtFormSubmit}
            onHousingChange={handleHousingChange}
            onHousingConfirm={() => void handleHousingConfirm()}
            onHousingSkip={handleHousingSkip}
            onAddAnother={handleAddAnother}
            onClose={handleClose}
          />
        </div>
      </BottomSheet>

      {/* Plausibiliteitsvraag bij een groot bedrag (H8). Geen blokkade: de
          gebruiker mag doorzetten. Spiegelt de dialoog in de volledige
          AssetForm (`components/core/assets-client.tsx`) zodat beide invoerpaden
          dezelfde vraag stellen. */}
      <ShellOverlay
        open={bedragBevestiging !== null}
        onClose={() => setBedragBevestiging(null)}
        kind="confirm"
        title="Klopt dit bedrag?"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const bevestigd = bedragBevestiging
                setBedragBevestiging(null)
                if (!bevestigd) return
                bedragBevestigdRef.current = bevestigd.bedrag
                void proceedFromAssetDetails(bevestigd.draft)
              }}
              className="flex-1 rounded-[var(--r)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)]"
              data-testid="quick-add-bedrag-bevestigen"
            >
              Ja, dit klopt
            </button>
            <button
              type="button"
              onClick={() => setBedragBevestiging(null)}
              className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)]"
            >
              Aanpassen
            </button>
          </div>
        }
      >
        {bedragBevestiging !== null && (
          <div className="px-6 py-4 text-sm leading-relaxed text-[var(--ink-2)]">
            <p>
              Je vult{' '}
              <span className="font-medium text-[var(--ink)]">
                <MaskedAmount value={bedragBevestiging.bedrag} tone="kern" />
              </span>{' '}
              in bij{' '}
              <span className="font-medium text-[var(--ink)]">
                {bedragBevestiging.draft.name}
              </span>
              .
            </p>
            <p className="mt-2 text-[var(--ink-3)]">
              Een bedrag van deze omvang is meestal een typefout — één nul te
              veel. Klopt het wel, dan gaan we gewoon verder.
            </p>
          </div>
        )}
      </ShellOverlay>

      {/* Mijlpaal "eerste bezitting" — ingetogen, zelf-sluitend; zweeft boven het
          success-scherm en verdwijnt vanzelf. Once-guard zit in de component. */}
      {celebrateFirstAsset && (
        <MilestoneCelebration
          celebrationKey="first-asset"
          title={
            <>
              Je eerste <em>bezitting</em> staat.
            </>
          }
          meaning="Vanaf hier maak je zichtbaar hoeveel vrijheid je al hebt opgebouwd."
          onDismiss={() => setCelebrateFirstAsset(false)}
        />
      )}
    </>
  )
}

// ── Render sub-component ───────────────────────────────────────────

interface WizardContentProps {
  state: WizardState
  linkDebtCtx: LinkDebtContext
  /** Openstaande woning-vraag; heeft voorrang boven élke andere stap. */
  housingAsk: HousingAskState | null
  totalSteps: number
  initialIntent?: QuickAddIntent
  /**
   * `true` wanneer zowel intent als bijbehorend type vooraf zijn ingesteld.
   * Verlaagt details-stap-nummering naar 1 en verbergt de back-knop op
   * details — er is geen vorige stap om naar terug te keren.
   */
  hasTypePrefill: boolean
  /**
   * Toont de `StepHeader` zijn eigen "Stap N van M"? In collect-mode staat de
   * wizard binnen een flow die al een eigen voortgangsbalk voert (onboarding),
   * die door de half-transparante backdrop heen zichtbaar blijft — dan telt
   * alléén die buitenste balk (bevinding M12).
   */
  showStepCount: boolean
  isSaving: boolean
  /**
   * Eist het zelfstandige schuld-pad een bezit-koppeling voor types die niet
   * los kunnen bestaan (`dga_schuld` → deelneming)? Alleen in commit-mode:
   * daar bestaan de bezittingen als DB-rij. In collect-mode (onboarding) is nog
   * niets gepersisteerd en loopt de koppeling ná de batch-insert via
   * `linked_client_ref`. Zie `StepDetails.requireLinkedAsset`.
   */
  requireLinkedAsset: boolean
  onBack: () => void
  onSelectIntent: (intent: QuickAddIntent) => void
  onSelectType: (type: AssetType | DebtType) => void
  onUpdateAsset: (patch: Partial<AssetQuickInput>) => void
  onUpdateDebt: (patch: Partial<DebtQuickInput>) => void
  onProceedAssetDetails: () => void
  onProceedDebtDetails: () => void
  onLinkDebtYes: () => void
  onLinkDebtNo: () => void
  onLinkDebtFormUpdate: (patch: Partial<DebtQuickInput>) => void
  onLinkDebtFormSubmit: () => void
  onHousingChange: (choice: HousingChoice) => void
  onHousingConfirm: () => void
  onHousingSkip: () => void
  onAddAnother: () => void
  onClose: () => void
}

function WizardContent(props: WizardContentProps) {
  const {
    state,
    linkDebtCtx,
    housingAsk,
    totalSteps,
    initialIntent,
    hasTypePrefill,
    showStepCount,
    isSaving,
    requireLinkedAsset,
    onBack,
    onSelectIntent,
    onSelectType,
    onUpdateAsset,
    onUpdateDebt,
    onProceedAssetDetails,
    onProceedDebtDetails,
    onLinkDebtYes,
    onLinkDebtNo,
    onLinkDebtFormUpdate,
    onLinkDebtFormSubmit,
    onHousingChange,
    onHousingConfirm,
    onHousingSkip,
    onAddAnother,
    onClose,
  } = props

  // Stap "linkDebt" — details + 1. Verschuift mee met type-prefill.
  const linkDebtStepNumber = hasTypePrefill ? 2 : initialIntent ? 3 : 4

  // Afsluitende woning-vraag (ADR 0133) — ná de hypotheek-vraag, vóór het
  // success-scherm. Zonder telling: deze stap komt er conditioneel bij, en
  // "Stap 5 van 5" ná "Stap 4 van 4" is een slechtere belofte dan geen telling.
  // Zonder terug-knop: alles ervóór is al opgeslagen (zelfde reden als bij de
  // koppel-prompt in commit-mode).
  if (housingAsk) {
    return (
      <>
        <StepHeader
          step={linkDebtStepNumber}
          total={totalSteps}
          showStepCount={false}
          title="Je woning"
          kicker="Grondslag"
        />
        <StepHousingChoice
          value={housingAsk.choice}
          onChange={onHousingChange}
          onConfirm={onHousingConfirm}
          onSkip={onHousingSkip}
          isSaving={housingAsk.isSaving}
          error={housingAsk.error}
        />
      </>
    )
  }

  // Stap 4b — koppel-schuld form. Heeft voorrang boven reducer-state.
  if (linkDebtCtx?.phase === 'form') {
    const iconName = DEBT_TYPE_ICONS[linkDebtCtx.debtDraft.debt_type]
    const color = DEBT_TYPE_COLORS[linkDebtCtx.debtDraft.debt_type]
    return (
      <>
        <StepHeader
          step={linkDebtStepNumber}
          total={totalSteps}
          showStepCount={showStepCount}
          title={DEBT_QUICK_ADD_LABELS[linkDebtCtx.debtDraft.debt_type]}
          kicker={`Voor ${linkDebtCtx.asset.name}`}
          onBack={onBack}
          icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
          iconColor={color}
        />
        <StepDetails
          intent="debt"
          draft={linkDebtCtx.debtDraft}
          onChange={onLinkDebtFormUpdate}
          onSubmit={onLinkDebtFormSubmit}
          isSaving={isSaving}
          submitLabel="Koppelen"
        />
      </>
    )
  }

  // Stap 4a — koppel-schuld prompt.
  if (linkDebtCtx?.phase === 'prompt') {
    return (
      <>
        <StepHeader
          step={linkDebtStepNumber}
          total={totalSteps}
          showStepCount={showStepCount}
          title="Gekoppelde schuld"
          kicker="Extra"
          onBack={onBack}
        />
        <StepLinkDebt
          assetType={linkDebtCtx.asset.asset_type}
          assetName={linkDebtCtx.asset.name}
          onYes={onLinkDebtYes}
          onNo={onLinkDebtNo}
        />
      </>
    )
  }

  switch (state.step) {
    case 'choice':
      return (
        <>
          <StepHeader
            step={1}
            total={totalSteps}
            showStepCount={showStepCount}
            title="Wat wil je toevoegen?"
            kicker="Nieuw item"
          />
          <StepChoice onSelect={onSelectIntent} />
        </>
      )

    case 'type': {
      const title = state.intent === 'asset' ? 'Welke bezitting?' : 'Welke schuld?'
      const stepNumber = initialIntent ? 1 : 2
      return (
        <>
          <StepHeader
            step={stepNumber}
            total={totalSteps}
            showStepCount={showStepCount}
            title={title}
            kicker={state.intent === 'asset' ? 'Bezitting' : 'Schuld'}
            onBack={initialIntent ? undefined : onBack}
          />
          <StepType intent={state.intent} onSelect={onSelectType} />
        </>
      )
    }

    case 'details': {
      const stepNumber = hasTypePrefill ? 1 : initialIntent ? 2 : 3
      // Type is voorgekookt → details is de eerste stap; geen back-knop
      // (anders zou de gebruiker terug naar een type-stap die hij niet
      // hoort te zien). Anders volgt de normale terug-flow.
      const detailsBack = hasTypePrefill ? undefined : onBack
      if (state.intent === 'asset') {
        const iconName = ASSET_TYPE_ICONS[state.assetDraft.asset_type]
        const color = ASSET_TYPE_COLORS[state.assetDraft.asset_type]
        const label = ASSET_QUICK_ADD_LABELS[state.assetDraft.asset_type]
        return (
          <>
            <StepHeader
              step={stepNumber}
              total={totalSteps}
              showStepCount={showStepCount}
              title={label}
              kicker="Gegevens"
              onBack={detailsBack}
              icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
              iconColor={color}
            />
            <StepDetails
              intent="asset"
              draft={state.assetDraft}
              onChange={onUpdateAsset}
              onSubmit={onProceedAssetDetails}
              isSaving={isSaving}
            />
          </>
        )
      }
      const iconName = DEBT_TYPE_ICONS[state.debtDraft.debt_type]
      const color = DEBT_TYPE_COLORS[state.debtDraft.debt_type]
      const label = DEBT_QUICK_ADD_LABELS[state.debtDraft.debt_type]
      return (
        <>
          <StepHeader
            step={stepNumber}
            total={totalSteps}
            showStepCount={showStepCount}
            title={label}
            kicker="Gegevens"
            onBack={detailsBack}
            icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
            iconColor={color}
          />
          <StepDetails
            intent="debt"
            draft={state.debtDraft}
            onChange={onUpdateDebt}
            onSubmit={onProceedDebtDetails}
            isSaving={isSaving}
            requireLinkedAsset={requireLinkedAsset}
          />
        </>
      )
    }

    case 'linkDebt':
    case 'linkDebtForm':
      // Worden hierboven al afgevangen via `linkDebtCtx`.
      return null

    case 'saving':
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Loader2
            className="h-6 w-6 animate-spin text-[var(--ink-3)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--ink-3)]">Opslaan…</p>
        </div>
      )

    case 'success':
      return (
        <SuccessView
          kind={state.kind}
          assetName={state.assetName}
          debtName={state.debtName}
          netAmount={state.netAmount}
          onAddAnother={onAddAnother}
          onClose={onClose}
        />
      )

    case 'error':
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <AlertCircle
            className="h-8 w-8 text-[var(--color-debt-600)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-serif text-lg italic text-[var(--ink)]">
              Opslaan mislukt
            </p>
            <p className="max-w-[32ch] text-sm text-[var(--ink-3)] leading-relaxed">
              {state.message}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center justify-center bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80"
            >
              Probeer opnieuw
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 text-sm text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
            >
              Sluiten
            </button>
          </div>
        </div>
      )

    default:
      return null
  }
}

// ── Success-scherm ────────────────────────────────────────────────

interface SuccessViewProps {
  kind: 'asset' | 'debt' | 'asset_with_debt'
  assetName?: string
  debtName?: string
  netAmount?: number
  onAddAnother: () => void
  onClose: () => void
}

function SuccessView({
  kind,
  assetName,
  debtName,
  netAmount,
  onAddAnother,
  onClose,
}: SuccessViewProps) {
  const headline =
    kind === 'asset_with_debt'
      ? `${assetName ?? 'Bezitting'} en ${debtName ?? 'schuld'} gekoppeld`
      : kind === 'debt'
        ? `${debtName ?? 'Schuld'} toegevoegd`
        : `${assetName ?? 'Bezitting'} toegevoegd`

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center text-[var(--positive)]"
        style={{ backgroundColor: 'color-mix(in oklch, var(--positive) 12%, var(--paper))' }}
      >
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
      </div>

      <div className="space-y-1">
        <h4
          tabIndex={-1}
          className="font-serif text-xl italic text-[var(--ink)] leading-tight"
        >
          {headline}
        </h4>
        {kind === 'asset_with_debt' && typeof netAmount === 'number' && (
          <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
            Netto:{' '}
            <span className="text-[var(--ink)]">{<MaskedAmount value={netAmount} tone="kern" />}</span>
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onAddAnother}
          className="inline-flex min-h-[44px] items-center justify-center bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80"
        >
          Nog een toevoegen
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center border border-[var(--border-ed)] px-4 py-2.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          Terug naar overzicht
        </button>
      </div>
    </div>
  )
}

// ── Derived helpers ───────────────────────────────────────────────

function deriveSheetTitle(
  state: WizardState,
  linkDebtCtx: LinkDebtContext,
  initial: QuickAddIntent | undefined,
): string {
  if (linkDebtCtx) return 'Gekoppelde schuld'
  if (state.step === 'saving') return 'Opslaan'
  if (state.step === 'success') return 'Toegevoegd'
  if (state.step === 'error') return 'Er ging iets mis'

  if (initial === 'asset') return 'Bezitting toevoegen'
  if (initial === 'debt') return 'Schuld toevoegen'

  if (state.step === 'type') {
    return state.intent === 'asset' ? 'Bezitting toevoegen' : 'Schuld toevoegen'
  }
  if (state.step === 'details') {
    return state.intent === 'asset' ? 'Bezitting toevoegen' : 'Schuld toevoegen'
  }
  return 'Snel toevoegen'
}

function deriveSheetHeight(state: WizardState, linkDebtCtx: LinkDebtContext): string {
  if (linkDebtCtx?.phase === 'form') return '70vh'
  if (state.step === 'type' || state.step === 'details') return '70vh'
  return 'auto'
}

function deriveCoupledDebtName(assetType: AssetType, assetName: string): string {
  switch (assetType) {
    case 'eigen_huis':
    case 'real_estate':
      return `Hypotheek — ${assetName}`
    case 'vehicle':
      return `Autolening — ${assetName}`
    case 'deelneming':
      return `RC-schuld — ${assetName}`
    default:
      return `Schuld — ${assetName}`
  }
}
