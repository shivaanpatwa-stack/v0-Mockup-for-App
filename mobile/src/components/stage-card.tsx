import { Check, CircleCheck, Navigation, Play, Timer } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { AssignmentStage, CurrentAssignment } from '@/lib/api'
import { formatIst, formatIstClock } from '@/lib/time'
import { Button, Card } from './ui'

const STEPS: { stage: AssignmentStage; label: string }[] = [
  { stage: 'planned', label: 'Planned' },
  { stage: 'en_route', label: 'En route' },
  { stage: 'in_position', label: 'In position' },
]

type Props = {
  assignment: CurrentAssignment
  stageTimes: Partial<Record<AssignmentStage, Date>>
  /** Set while the unit has an unacknowledged re-plan. */
  replannedAt?: Date
  busy: boolean
  /** The server can't be reached: the buttons stay visible but off, and nothing is queued. */
  offline?: boolean
  onAdvance: (stage: AssignmentStage) => void
}

function Step({ index, current, active }: { index: number; current: boolean; active: boolean }) {
  // Planned and In position show a check when reached; En route shows the navigation arrow while current.
  const showArrow = index === 1 && current
  return (
    <View style={[styles.circle, active ? styles.circleActive : styles.circleIdle]}>
      {!active ? (
        <Text style={styles.circleNumber}>{index + 1}</Text>
      ) : showArrow ? (
        <Navigation size={20} color={colors.white} />
      ) : (
        <Check size={20} color={colors.white} />
      )}
    </View>
  )
}

export function StageCard({ assignment, stageTimes, replannedAt, busy, offline, onAdvance }: Props) {
  const stageIndex = STEPS.findIndex((s) => s.stage === assignment.assignment_status)

  const sublabel = (index: number): { text: string; good?: boolean } | null => {
    const stage = STEPS[index].stage
    if (index === 0) {
      return replannedAt ? { text: `Re-assigned ${formatIstClock(replannedAt)}` } : { text: `For ${formatIst(assignment.valid_from)}` }
    }
    if (index === 2 && stageIndex === 2) return { text: 'Current stage', good: true }
    const at = stageTimes[stage]
    if (!at || stageIndex < index) return null
    return { text: `${stage === 'en_route' ? 'Started' : 'Arrived'} ${formatIstClock(at)}` }
  }

  return (
    <Card>
      <Text style={styles.title}>Assignment status</Text>

      <View style={styles.stepper}>
        {/* Connectors come first in the tree so the steps paint over them. */}
        <View pointerEvents="none" style={styles.lines}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.line, i < stageIndex && styles.lineDone]} />
          ))}
        </View>
        {STEPS.map((step, index) => {
          const sub = sublabel(index)
          return (
            <View key={step.stage} style={styles.step}>
              <Step index={index} current={index === stageIndex} active={index <= stageIndex} />
              <Text style={[styles.stepLabel, index > stageIndex && styles.stepLabelIdle]}>{step.label}</Text>
              {sub && <Text style={[styles.stepSub, sub.good && styles.stepSubGood]}>{sub.text}</Text>}
            </View>
          )
        })}
      </View>

      {stageIndex === 0 && (
        <Button
          label={offline ? 'Reconnect to update' : replannedAt ? 'Acknowledge & Start moving' : 'Start moving'}
          icon={<Play size={18} color={colors.white} fill={colors.white} />}
          busy={busy}
          disabled={offline}
          onPress={() => onAdvance('en_route')}
        />
      )}
      {stageIndex === 1 && (
        <Button
          label={offline ? 'Reconnect to update' : "I've arrived"}
          icon={<CircleCheck size={22} color={colors.white} />}
          busy={busy}
          disabled={offline}
          onPress={() => onAdvance('in_position')}
        />
      )}
      {stageIndex === 2 && (
        <View style={styles.hold}>
          <View style={styles.holdIcon}>
            <Timer size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.holdTitle}>Hold position until {formatIst(assignment.valid_to)}</Text>
            <Text style={styles.holdText}>Stand by for emergency dispatches or next schedule plan</Text>
          </View>
        </View>
      )}
    </Card>
  )
}

const CIRCLE = 56

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  stepper: { flexDirection: 'row', marginTop: 22, marginBottom: 22 },
  step: { flex: 1, alignItems: 'center' },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  circleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  circleIdle: { backgroundColor: colors.card, borderColor: colors.stepIdle },
  circleNumber: { fontSize: 18, fontWeight: '700', color: colors.muted },
  stepLabel: { marginTop: 10, fontSize: 16, fontWeight: '700', color: colors.text },
  stepLabelIdle: { fontWeight: '500', color: colors.muted },
  stepSub: { marginTop: 2, fontSize: 13, color: colors.muted, textAlign: 'center' },
  stepSubGood: { color: colors.green, fontWeight: '600' },
  lines: { position: 'absolute', top: CIRCLE / 2 - 1.5, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: '16.6%' },
  line: { flex: 1, height: 3, backgroundColor: colors.stepIdle },
  lineDone: { backgroundColor: colors.primary },
  hold: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, backgroundColor: colors.blueBg },
  holdIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  holdTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  holdText: { fontSize: 15, color: colors.muted, marginTop: 2 },
})
