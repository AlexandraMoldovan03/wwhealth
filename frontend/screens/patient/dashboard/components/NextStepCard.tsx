import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

import type { ProgressStep } from '../useRecordProgress';

/** The one recommended next step (first unfinished checklist item), or what to do once the record is complete. */
export function NextStepCard({ next, enterIndex }: { next: ProgressStep | null; enterIndex?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const key = next ? `progress.steps.${next.id}` : 'progress.complete';
  return (
    <AppCard enterIndex={enterIndex} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.primary }]}>
      <AppText variant="label" color="primary">
        {t('progress.nextStep').toUpperCase()}
      </AppText>
      <View style={styles.row}>
        <Ionicons name={next?.icon ?? 'shield-checkmark-outline'} size={22} color={colors.primary} />
        <View style={styles.flex}>
          <AppText variant="heading">{t(`${key}.title`)}</AppText>
          <AppText variant="caption" color="textMuted">
            {t(`${key}.why`)}
          </AppText>
        </View>
      </View>
      <AppButton
        title={t(`${key}.cta`)}
        trailingIcon="arrow-forward"
        size="sm"
        onPress={() => router.navigate(next?.route ?? '/transfer')}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
