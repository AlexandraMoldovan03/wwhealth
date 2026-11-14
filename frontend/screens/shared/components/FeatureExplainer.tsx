import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';
import { useTranslation } from 'react-i18next';

/** Short, plain explanations of the technology behind a feature (`explain.<id>` in i18n). */
export type ExplainerId = 'ocr' | 'gemini' | 'lungvision' | 'qr' | 'consent' | 'voice';

const ICON: Record<ExplainerId, IconName> = {
  ocr: 'document-text-outline',
  gemini: 'sparkles-outline',
  lungvision: 'scan-outline',
  qr: 'qr-code-outline',
  consent: 'key-outline',
  voice: 'mic-outline',
};

export function FeatureExplainer({ id, enterIndex }: { id: ExplainerId; enterIndex?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <AppCard tone="flat" enterIndex={enterIndex} style={styles.card}>
      <View style={styles.row}>
        <Ionicons name={ICON[id]} size={18} color={colors.primary} />
        <View style={styles.flex}>
          <AppText variant="subheading">{t(`explain.${id}.title`)}</AppText>
          <AppText variant="caption" color="textMuted">
            {t(`explain.${id}.text`)}
          </AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
