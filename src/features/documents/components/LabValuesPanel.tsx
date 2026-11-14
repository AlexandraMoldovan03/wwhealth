import { router } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { LabFlagBadge } from '@/features/labs/components/LabFlagBadge';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import { formatDate } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/**
 * Confirmed lab values of a document, with Edit (→ review screen) or, when there are none,
 * "Read values" for a PDF / image already uploaded. Hidden if lab storage is not set up.
 */
export function LabValuesPanel({ documentId }: { documentId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const load = useCallback(() => api.getLabValues(documentId), [documentId]);
  const { data, error } = useAsync(load, { refetchOnFocus: true });
  const open = (extract: boolean) =>
    router.push({ pathname: '/patient/lab-review/[id]', params: extract ? { id: documentId, extract: '1' } : { id: documentId } });

  if (error || !data) return null;

  if (data.length === 0) {
    return (
      <AppCard style={styles.empty} tone="muted">
        <View style={styles.flex}>
          <AppText variant="subheading">{t('labs.panelTitle')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('labs.panelEmpty')}
          </AppText>
        </View>
        <AppButton title={t('labs.read')} icon="scan-outline" size="sm" variant="secondary" onPress={() => open(true)} />
      </AppCard>
    );
  }

  const measuredAt = data.find((v) => v.measuredAt)?.measuredAt;
  return (
    <AppCard style={styles.card} tone="muted">
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="label" color="textMuted">
            {t('scanner.savedValues', { count: data.length })}
          </AppText>
          {measuredAt && (
            <AppText variant="caption" color="textMuted">
              {t('labs.measuredOn', { date: formatDate(measuredAt) })}
            </AppText>
          )}
        </View>
        <AppButton title={t('common.edit')} icon="create-outline" size="sm" variant="outline" onPress={() => open(false)} />
      </View>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {data.map((v, i) => (
          <View key={`${v.name}-${i}`} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.flex}>
              <AppText numberOfLines={1}>{v.name}</AppText>
              {v.referenceRange && (
                <AppText variant="caption" color="textMuted">
                  {t('labs.reference')}: {v.referenceRange}
                </AppText>
              )}
            </View>
            <View style={styles.valueCol}>
              <AppText variant="subheading">
                {v.value}
                {v.unit ? ` ${v.unit}` : ''}
              </AppText>
              <LabFlagBadge value={v.value} range={v.referenceRange} />
            </View>
          </View>
        ))}
      </ScrollView>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, paddingVertical: spacing.sm + 2 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scroll: { maxHeight: 190 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  valueCol: { alignItems: 'flex-end', gap: 2 },
  flex: { flex: 1 },
});
