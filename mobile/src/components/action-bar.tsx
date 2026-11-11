import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '@/constants'
import { Button } from './ui'

export type PrimaryAction = { label: string; icon: ReactNode; onPress: () => void; busy?: boolean; disabled?: boolean }

/**
 * Pinned above the tab bar so the one action a driver must reach never scrolls out of sight.
 * Only rendered while there is a next step to take (Start moving, I've arrived).
 */
export function ActionBar({ primary }: { primary: PrimaryAction }) {
  return (
    <View style={styles.bar}>
      <Button {...primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
})
