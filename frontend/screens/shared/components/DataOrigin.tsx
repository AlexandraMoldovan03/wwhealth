import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';
import { useTranslation } from 'react-i18next';

/**
 * Where a piece of data comes from — always shown the same way across the app:
 * confirmed (entered or checked by the patient), extracted (read automatically from a document, to review),
 * ai (experimental AI result — informative, not a diagnosis).
 */
export type DataOrigin = 'confirmed' | 'extracted' | 'ai';

const ICON: Record<DataOrigin, IconName> = {
  confirmed: 'checkmark-circle-outline',
  extracted: 'scan-outline',
  ai: 'flask-outline',
};

function useOriginColor() {
  const { colors } = useTheme();
  return { confirmed: colors.success, extracted: colors.warning, ai: colors.accent } as Record<DataOrigin, string>;
}

export function DataOriginBadge({ origin }: { origin: DataOrigin }) {
  const { t } = useTranslation();
  const color = useOriginColor()[origin];
  return <Badge label={t(`origin.${origin}.label`)} color={color} />;
}

/** Legend of the three kinds of data (hubs, AI screens). */
export function DataOriginLegend({ enterIndex }: { enterIndex?: number }) {
  const { t } = useTranslation();
  const colorOf = useOriginColor();
  return (
    <AppCard tone="muted" enterIndex={enterIndex} style={styles.card}>
      <AppText variant="label" color="textMuted">
        {t('origin.legendTitle').toUpperCase()}
      </AppText>
      {(['confirmed', 'extracted', 'ai'] as const).map((o) => (
        <View key={o} style={styles.row}>
          <Ionicons name={ICON[o]} size={18} color={colorOf[o]} />
          <View style={styles.flex}>
            <AppText variant="subheading">{t(`origin.${o}.label`)}</AppText>
            <AppText variant="caption" color="textMuted">
              {t(`origin.${o}.text`)}
            </AppText>
          </View>
        </View>
      ))}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
