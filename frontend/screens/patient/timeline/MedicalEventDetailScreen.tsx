import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, Badge, ErrorState, IconBadge, InfoRow, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { getEventStyle } from '@/screens/shared/components/eventStyle';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

export function MedicalEventDetailScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);
  const event = data?.history.find((e) => e.id === id);

  if (isLoading) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error || !event) {
    return <ScreenContainer edges={['bottom']}><ErrorState message={error ?? t('history.notFound')} onRetry={reload} /></ScreenContainer>;
  }

  const style = getEventStyle(event.type, colors);

  return (
    <ScreenContainer edges={['bottom']}>
      <Stack.Screen options={{ title: event.title }} />
      <AppCard style={styles.hero}>
        <IconBadge icon={style.icon} color={style.color} size={56} />
        <View style={styles.heroText}>
          <AppText variant="heading">{event.title}</AppText>
          <AppText variant="caption" color="textMuted">
            {formatDateTime(event.date)}
          </AppText>
          <Badge label={t(`history.types.${event.type}`)} color={style.color} />
        </View>
      </AppCard>
      <AppCard style={styles.section}>
        <AppText variant="label" color="textMuted">
          {t('history.description')}
        </AppText>
        <AppText>{event.description}</AppText>
      </AppCard>
      <AppCard>
        {Object.entries(event.details).map(([key, value], i) => (
          <InfoRow key={key} first={i === 0} label={key} value={value} />
        ))}
      </AppCard>
      {event.documentId && (
        <AppButton
          title={t('history.openDocument')}
          icon="eye-outline"
          fullWidth
          onPress={() => router.push({ pathname: '/patient/document/[id]', params: { id: event.documentId as string } })}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.sm },
});
