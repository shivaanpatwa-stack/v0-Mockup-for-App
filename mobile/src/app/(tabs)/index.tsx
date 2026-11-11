import { CircleCheck, Play } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { ActionBar } from '@/components/action-bar'
import type { PrimaryAction } from '@/components/action-bar'
import { AvailabilitySheet } from '@/components/availability-sheet'
import { BackOnlineNotice, ErrorNotice, NoticeBanner, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { PositionCard } from '@/components/position-card'
import { StageCard } from '@/components/stage-card'
import { EmptyState, LoadingState } from '@/components/states'
import { UnitCard } from '@/components/unit-card'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import type { AssignmentStage } from '@/lib/api'
import { formatWindow } from '@/lib/time'
import { useFleet } from '@/state/fleet'

export default function AssignmentScreen() {
  const {
    unit, hospital, demand, error, offline, backOnline, dataAt, rateLimitUntil, fleetLoaded, positionUpdate, stageTimes, actionError,
    refresh, setAvailability, setStage, dismissPositionUpdate, clearActionError,
  } = useFleet()
  const [refreshing, setRefreshing] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  // Every 10 s while the app is in the foreground and this tab is the one being looked at.
  const poll = useCallback(() => {
    refresh()
  }, [refresh])
  useFocusedPolling(poll)

  // "Now", re-read every 30 s, so a plan flips to "ended" without waiting for a poll.
  const [now, setNow] = useState(() => Date.now())
  const tick = useCallback(() => setNow(Date.now()), [])
  useFocusedPolling(tick, 30_000)

  async function onRefresh() {
    setRefreshing(true)
    await refresh({ force: true })
    setRefreshing(false)
  }

  if (!unit) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <ErrorNotice error={error} onRetry={onRefresh} retrying={refreshing} /> : <LoadingState label={fleetLoaded ? 'Finding your unit…' : 'Loading your unit…'} />}
      </ScrollView>
    )
  }

  const assignment = unit.current_assignment
  const planEnded = assignment !== null && now > new Date(assignment.valid_to).getTime()

  // The next step of a live plan. In position has none: from there the plan just runs out.
  let primary: PrimaryAction | null = null
  if (assignment && !planEnded && assignment.assignment_status !== 'in_position') {
    const toEnRoute = assignment.assignment_status === 'planned'
    primary = {
      label: offline ? 'Reconnect to update' : toEnRoute ? (positionUpdate ? 'Acknowledge & Start moving' : 'Start moving') : "I've arrived",
      icon: toEnRoute ? <Play size={18} color={colors.white} fill={colors.white} /> : <CircleCheck size={22} color={colors.white} />,
      onPress: () => onAdvance(toEnRoute ? 'en_route' : 'in_position'),
      busy: advancing,
      disabled: offline,
    }
  }

  async function onAdvance(stage: AssignmentStage) {
    setAdvancing(true)
    const result = await setStage(stage)
    if (result.ok && stage === 'en_route') dismissPositionUpdate() // "Acknowledge & Start moving"
    setAdvancing(false)
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <RateLimitNotice until={rateLimitUntil} />
        {offline ? (
          <OfflineNotice cachedAt={dataAt} onRetry={onRefresh} retrying={refreshing} />
        ) : (
          error && <ErrorNotice error={error} stale onRetry={onRefresh} retrying={refreshing} />
        )}
        <BackOnlineNotice show={backOnline} />
        {actionError && <ErrorNotice error={actionError} onDismiss={clearActionError} />}
        {positionUpdate && (
          <NoticeBanner
            tone="info"
            message={`Your plan was updated. New position: ${positionUpdate.name}`}
            onDismiss={dismissPositionUpdate}
          />
        )}

        <UnitCard unit={unit} onPressStatus={() => setSheetOpen(true)} statusDisabled={offline} />

        {!assignment ? (
          <EmptyState
            title="No position assigned yet."
            message={
              unit.status === 'unavailable'
                ? "You're out of service, so you're left out of the next position plan. Set yourself available to be planned in."
                : 'Waiting for the next position plan from dispatch. Pull down to refresh.'
            }
          />
        ) : planEnded ? (
          <EmptyState
            title={`Your ${formatWindow(assignment.valid_from, assignment.valid_to)} plan has ended`}
            message="Waiting for the next position plan from dispatch."
          />
        ) : (
          <>
            <PositionCard
              assignment={assignment}
              risk={assignment.ward_code ? demand[assignment.ward_code] : undefined}
              base={hospital ?? undefined}
            />
            <StageCard
              assignment={assignment}
              stageTimes={stageTimes}
              replannedAt={positionUpdate?.revisedAt}
            />
          </>
        )}

      </ScrollView>

      {primary && <ActionBar primary={primary} />}

      <AvailabilitySheet visible={sheetOpen} current={unit.status} onChange={setAvailability} onClose={() => setSheetOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16 },
})
