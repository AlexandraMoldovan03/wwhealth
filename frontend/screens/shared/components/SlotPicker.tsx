import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { Slot } from '@/types';
import { formatDay, formatTime, localDayKey } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Free slots grouped by local day; one can be selected. `booked` marks slots shown but not selectable. */
export function SlotPicker({
  slots,
  selectedId,
  onSelect,
  booked,
  onLongPress,
}: {
  slots: Slot[];
  selectedId?: string | null;
  onSelect?: (slot: Slot) => void;
  booked?: Set<string>;
  onLongPress?: (slot: Slot) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const days = new Map<string, Slot[]>();
  for (const s of slots) days.set(localDayKey(s.startsAt), [...(days.get(localDayKey(s.startsAt)) ?? []), s]);

  return (
    <View style={styles.wrap}>
      {[...days.values()].map((daySlots) => (
        <View key={localDayKey(daySlots[0].startsAt)} style={styles.day}>
          <AppText variant="label" color="textMuted">
            {formatDay(daySlots[0].startsAt)}
          </AppText>
          <View style={styles.chips}>
            {daySlots.map((s) => {
              const selected = s.id === selectedId;
              const isBooked = booked?.has(s.id) ?? false;
              const label = formatTime(s.startsAt);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onSelect?.(s)}
                  onLongPress={onLongPress ? () => onLongPress(s) : undefined}
                  disabled={!onSelect && !onLongPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${formatDay(s.startsAt)} ${label}${isBooked ? `, ${t('care.slot.booked')}` : ''}`}
                  style={[
                    styles.chip,
                    { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface },
                    isBooked && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <AppText variant="label" style={{ color: selected ? colors.background : isBooked ? colors.textMuted : colors.text }}>
                    {label}
                  </AppText>
                  {isBooked && (
                    <AppText variant="caption" color="textMuted">
                      {t('care.slot.booked')}
                    </AppText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  day: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minWidth: 72, alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
});
