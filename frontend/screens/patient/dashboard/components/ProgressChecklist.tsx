import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

import type { ProgressStep } from '../useRecordProgress';

/** "Complete your record" checklist with real progress. Can be hidden (and shown again from Profile). */
export function ProgressChecklist({
  steps,
  doneCount,
  onHide,
  enterIndex,
}: {
  steps: ProgressStep[];
  doneCount: number;
  onHide: () => void;
  enterIndex?: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <AppCard enterIndex={enterIndex} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="heading">{t('progress.title')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('progress.count', { done: doneCount, total: steps.length })}
          </AppText>
        </View>
        <Pressable onPress={onHide} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('progress.hide')}>
          <AppText variant="caption" color="primary">
            {t('progress.hide')}
          </AppText>
        </Pressable>
      </View>
      <View
        style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
      </View>
      {steps.map((step) => (
        <Pressable
          key={step.id}
          onPress={() => router.push(step.route)}
          accessibilityRole="button"
          accessibilityState={{ checked: step.done }}
          accessibilityLabel={`${t(`progress.steps.${step.id}.title`)}, ${step.done ? t('progress.done') : t('progress.todo')}`}
          style={({ pressed }) => [styles.step, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons
            name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={step.done ? colors.success : colors.textSubtle}
          />
          <View style={styles.flex}>
            <AppText variant="subheading" color={step.done ? 'textMuted' : 'text'}>
              {t(`progress.steps.${step.id}.title`)}
            </AppText>
            {!step.done && (
              <AppText variant="caption" color="textMuted">
                {t(`progress.steps.${step.id}.why`)}
              </AppText>
            )}
          </View>
          {!step.done && <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />}
        </Pressable>
      ))}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
