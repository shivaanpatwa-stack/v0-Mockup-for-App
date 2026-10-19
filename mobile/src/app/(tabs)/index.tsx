import { ToggleLeft } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AvailabilitySheet } from '@/components/availability-sheet'
import { ErrorNotice } from '@/components/notice-banner'
import { PositionCard } from '@/components/position-card'
import { PositionUpdateBanner } from '@/components/position-update-banner'
import { StageCard } from '@/components/stage-card'
import { EmptyState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui'
import { UnitCard } from '@/components/unit-card'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import type { AssignmentStage } from '@/lib/api'
import { formatLocalClock } from '@/lib/time'
import { useFleet } from '@/state/fleet'

export default function AssignmentScreen() {
  const {
    unit, hospital, demand, error, fleetLoaded, lastUpdated, positionUpdate, stageTimes, actionError,
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
        {error && <ErrorNotice error={error} stale onRetry={onRefresh} retrying={refreshing} />}
        {actionError && <ErrorNotice error={actionError} onDismiss={clearActionError} />}
        {positionUpdate && <PositionUpdateBanner update={positionUpdate} onDismiss={dismissPositionUpdate} />}

        <UnitCard unit={unit} />

        {assignment ? (
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
              onAdvance={onAdvance}
            />
          </>
        ) : (
          <EmptyState
            title="No position assigned"
            message={
              unit.status === 'unavailable'
                ? "You're out of service, so you're left out of the next position plan. Set yourself available to be planned in."
                : 'Waiting for the next position plan from dispatch. Pull down to refresh.'
            }
          />
        )}

        <Button
          variant="outline"
          label="Change availability"
          icon={<ToggleLeft size={22} color={colors.text} />}
          onPress={() => setSheetOpen(true)}
        />

        {lastUpdated && <Text style={styles.updated}>Last updated {formatLocalClock(lastUpdated)}</Text>}
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
