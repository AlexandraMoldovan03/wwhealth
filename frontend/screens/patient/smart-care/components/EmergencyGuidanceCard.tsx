import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { EmergencyGuidance } from '@/types';
import { useTranslation } from 'react-i18next';

/** Rule-based guidance (never AI): call 112 now, or go to urgent care today. */
export function EmergencyGuidanceCard({ guidance }: { guidance: EmergencyGuidance }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const critical = guidance.level === 'call_112';
  const tone = critical ? colors.danger : colors.warning;

  return (
    <AppCard style={[styles.card, { borderLeftWidth: 4, borderLeftColor: tone }]} enterIndex={0}>
      <View style={styles.row} accessibilityRole="alert">
        <Ionicons name={critical ? 'call' : 'alert-circle'} size={22} color={tone} />
        <AppText variant="subheading" style={styles.flex}>
          {t(critical ? 'care.emergency.callTitle' : 'care.emergency.urgentTitle')}
        </AppText>
      </View>
      <AppText>{t(critical ? 'care.emergency.callText' : 'care.emergency.urgentText')}</AppText>
      {guidance.codes.length > 0 && (
        <AppText variant="caption" color="textMuted">
          {t('care.emergency.detected')}: {guidance.codes.map((c) => t(`care.flags.${c}`, { defaultValue: c })).join(', ')}
        </AppText>
      )}
      <AppButton
        title={t('care.emergency.call112')}
        icon="call-outline"
        variant={critical ? 'danger' : 'outline'}
        fullWidth
        onPress={() => void Linking.openURL('tel:112')}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
