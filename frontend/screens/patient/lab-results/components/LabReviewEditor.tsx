import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AppButton, AppCard, AppText, fadeIn, fadeOut } from '@/design-system';
import { radius, spacing, typography } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { LabFlagBadge } from './LabFlagBadge';
import type { LabValueEntry } from '@/types';
import { useTranslation } from 'react-i18next';

/** Verify / correct / remove the extracted values before they are saved. Uncertain ones need a tap on Confirm. */
export function LabReviewEditor({ values, onChange }: { values: LabValueEntry[]; onChange: (values: LabValueEntry[]) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<LabValueEntry>) => onChange(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const field = (i: number, key: 'name' | 'value' | 'unit' | 'referenceRange', flex: number, label: string) => (
    <View style={[styles.field, { flex }]}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <TextInput
        value={values[i][key] ?? ''}
        onChangeText={(text) => update(i, { [key]: key === 'name' || key === 'value' ? text : text || null })}
        accessibilityLabel={`${label} ${values[i].name}`}
        placeholder="—"
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
      />
    </View>
  );

  return (
    <View style={styles.list}>
      {values.map((v, i) => (
        <Animated.View key={`${i}-${v.sourceLine ?? v.name}`} entering={fadeIn(i)} exiting={fadeOut} layout={LinearTransition.reduceMotion(ReduceMotion.System)}>
          <AppCard style={[styles.card, v.needsReview && { borderColor: colors.warning, borderWidth: 1 }]} tone="flat">
            {v.needsReview && (
              <View style={styles.reviewRow}>
                <Ionicons name="help-circle-outline" size={18} color={colors.warning} />
                <AppText variant="caption" color="warning" style={styles.flex}>
                  {t('labs.uncertain')}
                </AppText>
                <AppButton title={t('labs.confirm')} icon="checkmark" size="sm" variant="outline" onPress={() => update(i, { needsReview: false })} />
              </View>
            )}
            <View style={styles.row}>
              {field(i, 'name', 1, t('scanner.name'))}
              <Pressable
                onPress={() => onChange(values.filter((_, j) => j !== i))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('scanner.remove', { name: v.name })}
                style={styles.remove}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
            <View style={styles.row}>
              {field(i, 'value', 1, t('scanner.value'))}
              {field(i, 'unit', 1, t('scanner.unit'))}
              {field(i, 'referenceRange', 1.4, t('scanner.range'))}
            </View>
            <LabFlagBadge value={v.value} range={v.referenceRange} />
            {v.sourceLine && (
              <AppText variant="caption" color="textSubtle" numberOfLines={2}>
                {t('scanner.source')}: “{v.sourceLine}”
              </AppText>
            )}
          </AppCard>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  field: { gap: spacing.xxs },
  input: { height: 42, borderRadius: radius.md, paddingHorizontal: spacing.sm + 2, fontFamily: typography.body.fontFamily, fontSize: 15 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  remove: { height: 42, width: 36, alignItems: 'center', justifyContent: 'center' },
});
