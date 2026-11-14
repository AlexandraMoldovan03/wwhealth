import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** Values the user confirmed for this document (hidden when there are none or storage is not set up). */
export function LabValuesPanel({ documentId }: { documentId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const load = useCallback(() => api.getLabValues(documentId), [documentId]);
  const { data } = useAsync(load);
  if (!data || data.length === 0) return null;
  return (
    <AppCard style={styles.card} tone="muted">
      <AppText variant="label" color="textMuted">
        {t('scanner.savedValues', { count: data.length })}
      </AppText>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {data.map((v, i) => (
          <View key={`${v.name}-${i}`} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <AppText style={styles.flex} numberOfLines={1}>
              {v.name}
            </AppText>
            <AppText variant="subheading">
              {v.value}
              {v.unit ? ` ${v.unit}` : ''}
            </AppText>
            {v.referenceRange && (
              <AppText variant="caption" color="textMuted">
                ({v.referenceRange})
              </AppText>
            )}
          </View>
        ))}
      </ScrollView>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, paddingVertical: spacing.sm + 2 },
  scroll: { maxHeight: 150 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  flex: { flex: 1 },
});
