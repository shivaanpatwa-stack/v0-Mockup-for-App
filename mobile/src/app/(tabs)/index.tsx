import { ToggleLeft } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AvailabilitySheet } from '@/components/availability-sheet'
import { BackOnlineNotice, ErrorNotice, NoticeBanner, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { PositionCard } from '@/components/position-card'
import { StageCard } from '@/components/stage-card'
import { EmptyState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui'
import { UnitCard } from '@/components/unit-card'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import type { AssignmentStage } from '@/lib/api'
import { formatIstClock, formatWindow } from '@/lib/time'
import { useFleet } from '@/state/fleet'

export default function AssignmentScreen() {
  const {
    unit, hospital, demand, error, offline, backOnline, dataAt, rateLimitUntil, fleetLoaded, lastUpdated, positionUpdate, stageTimes, actionError,
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

  async function onAdvance(stage: AssignmentStage) {
    setAdvancing(true)
    const result = await setStage(stage)
    if (result.ok && stage === 'en_route') dismissPositionUpdate() // "Acknowledge & Start moving"
    setAdvancing(false)
  }

  return (
    <>
      <ScrollView
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

        <UnitCard unit={unit} />

        {!assignment ? (
          <EmptyState
            title="No position assigned yet."
            message={
              unit.status === 'unavailable'
                ? "You're out of service, so you're left out of the next position plan. Set yourself available to be planned in."
                : 'Waiting for the next position plan from dispatch. Pull down to refresh.'
            }
          />
        ) : now > new Date(assignment.valid_to).getTime() ? (
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
              busy={advancing}
              offline={offline}
              onAdvance={onAdvance}
            />
          </>
        )}

        <Button
          variant="outline"
          label={offline ? 'Reconnect to update' : 'Change availability'}
          icon={<ToggleLeft size={22} color={colors.text} />}
          disabled={offline}
          onPress={() => setSheetOpen(true)}
        />

        {lastUpdated && <Text style={styles.updated}>Last updated {formatIstClock(lastUpdated)}</Text>}
        <View style={{ height: 8 }} />
      </ScrollView>

      <AvailabilitySheet visible={sheetOpen} current={unit.status} onChange={setAvailability} onClose={() => setSheetOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  updated: { textAlign: 'center', color: colors.muted, fontSize: 15, marginTop: 8 },
})
