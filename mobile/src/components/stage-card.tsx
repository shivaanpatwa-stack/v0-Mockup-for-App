import { Check, Clock, MapPin, Navigation, Timer } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { AssignmentStage, CurrentAssignment } from '@/lib/api'
import { formatIst, formatIstClock } from '@/lib/time'
import { Card } from './ui'

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
}

const STEP_ICONS = [Clock, Navigation, MapPin]

// Done steps show a check, the current step is a filled circle inside a ring (it is where you are, not something
// finished), and upcoming steps are plain outlines with their number.
function Step({ index, stageIndex }: { index: number; stageIndex: number }) {
  const done = index < stageIndex
  const current = index === stageIndex
  const Icon = STEP_ICONS[index]

  if (current) {
    return (
      <View style={styles.ring}>
        <View style={[styles.circle, styles.circleFilled]}>
          <Icon size={22} color={colors.white} />
        </View>
      </View>
    )
  }
  return (
    <View style={styles.ringSlot}>
      {done ? (
        <View style={[styles.circle, styles.circleFilled]}>
          <Check size={22} color={colors.white} />
        </View>
      ) : (
        <View style={[styles.circle, styles.circleUpcoming]}>
          <Text style={styles.circleNumber}>{index + 1}</Text>
        </View>
      )}
    </View>
  )
}

export function StageCard({ assignment, stageTimes, replannedAt }: Props) {
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
              <Step index={index} stageIndex={stageIndex} />
              <Text style={[styles.stepLabel, index > stageIndex && styles.stepLabelIdle, index === stageIndex && styles.stepLabelCurrent]}>{step.label}</Text>
              {sub && <Text style={[styles.stepSub, sub.good && styles.stepSubGood]}>{sub.text}</Text>}
            </View>
          )
        })}
      </View>

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

const RING = 64 // every step occupies the same slot, so the ring on the current one doesn't shift the row
const CIRCLE = 52

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  stepper: { flexDirection: 'row', marginTop: 20, marginBottom: 20 },
  step: { flex: 1, alignItems: 'center' },
  ringSlot: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { width: RING, height: RING, borderRadius: 22, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  circleFilled: { backgroundColor: colors.primary },
  circleUpcoming: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.outline },
  circleNumber: { fontSize: 16, fontWeight: '700', color: colors.muted },
  stepLabel: { marginTop: 8, fontSize: 14, fontWeight: '600', color: colors.text },
  stepLabelCurrent: { fontWeight: '700', color: colors.primary },
  stepLabelIdle: { fontWeight: '500', color: colors.muted },
  stepSub: { marginTop: 2, fontSize: 12, color: colors.muted, textAlign: 'center' },
  stepSubGood: { color: colors.green, fontWeight: '600' },
  lines: { position: 'absolute', top: RING / 2 - 1, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: '16.6%' },
  line: { flex: 1, height: 2, backgroundColor: colors.outline, opacity: 0.55 },
  lineDone: { backgroundColor: colors.primary, opacity: 1, height: 3 },
  hold: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, backgroundColor: colors.blueBg },
  holdIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  holdTitle: { fontSize: 16, fontWeight: '700', color: colors.primary },
  holdText: { fontSize: 14, color: colors.muted, marginTop: 2 },
})
