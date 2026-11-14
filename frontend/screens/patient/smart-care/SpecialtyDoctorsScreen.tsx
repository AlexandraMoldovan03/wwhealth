import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, DemoNotice, ErrorState, ListRow, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { USE_MOCKS } from '@/config/config';
import { api } from '@/services/backend';
import { formatDay, formatTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Verified doctors of one specialty with their real free slots (next 14 days) from the WWHealth calendar. */
export function SpecialtyDoctorsScreen({ id, name, fromCare }: { id: string; name?: string; fromCare?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const load = useCallback(() => api.listSpecialtyDoctors(id), [id]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const available = (data ?? []).filter((d) => d.freeSlots > 0);
  const title = name ?? t('care.doctors.title');

  return (
    <ScreenContainer
      edges={['bottom']}
      help="smartCare"
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title }} />
      {fromCare && <AppText variant="label" color="primary">{t('care.flow.step', { current: 3 })}</AppText>}
      <AppText variant="heading" accessibilityRole="header">{t('care.flow.chooseDoctor')}</AppText>

      {USE_MOCKS && !!available.length && <DemoNotice message={t('care.flow.appointmentDemo')} />}
      {error && <ErrorState message={t('care.flow.requestError')} onRetry={reload} />}
      {!data && !error && <LoadingState count={2} />}

      {data && !error && available.length === 0 && (
        <AppCard style={styles.card}>
          <AppText variant="subheading">{t(data.length === 0 ? 'care.doctors.noneTitle' : 'care.doctors.noSlotsTitle', { name: title })}</AppText>
          <AppText color="textMuted">{t('care.doctors.noneText')}</AppText>
          <AppButton title={t('care.doctors.otherSpecialty')} icon="search-outline" variant="outline" fullWidth onPress={() => router.push('/patient/specialties')} />
          <AppText variant="caption" color="textMuted">
            {t('care.emergencyNote')}
          </AppText>
        </AppCard>
      )}

      {!error && available.length > 0 && (
        <View style={styles.list}>
          {available.map((d, i) => (
            <ListRow
              key={d.id}
              icon="medkit-outline"
              iconColor={colors.primary}
              title={d.fullName}
              subtitle={`${title} · ${d.nextSlot
                ? t('care.doctors.next', { when: `${formatDay(d.nextSlot)} ${formatTime(d.nextSlot)}`, count: d.freeSlots })
                : t('care.flow.availability')}`}
              enterIndex={i}
              onPress={() => router.push({ pathname: '/patient/book/[doctorId]', params: { doctorId: d.id, specialtyId: id, doctorName: d.fullName, specialtyName: name ?? '' } })}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ card: { gap: spacing.sm }, list: { gap: spacing.sm } });
