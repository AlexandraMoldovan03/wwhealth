import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, Badge, ErrorState, ListRow, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';
import { formatDay, formatTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Verified doctors of one specialty with their real free slots (next 14 days) from the WWHealth calendar. */
export function SpecialtyDoctorsScreen({ id, name }: { id: string; name?: string }) {
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
      <AppText color="textMuted">{t('care.doctors.intro')}</AppText>

      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={2} />}

      {data && available.length === 0 && (
        <AppCard style={styles.card}>
          <AppText variant="subheading">{t(data.length === 0 ? 'care.doctors.noneTitle' : 'care.doctors.noSlotsTitle', { name: title })}</AppText>
          <AppText color="textMuted">{t('care.doctors.noneText')}</AppText>
          <AppButton title={t('care.doctors.otherSpecialty')} icon="search-outline" variant="outline" fullWidth onPress={() => router.push('/patient/specialties')} />
          {id !== 'family_medicine' && (
            <AppButton
              title={t('care.doctors.familyMedicine')}
              icon="people-outline"
              variant="outline"
              fullWidth
              onPress={() => router.push({ pathname: '/patient/specialty/[id]', params: { id: 'family_medicine', name: t('care.doctors.familyMedicineName') } })}
            />
          )}
          <AppText variant="caption" color="textMuted">
            {t('care.emergencyNote')}
          </AppText>
        </AppCard>
      )}

      {data && data.length > 0 && (
        <View style={styles.list}>
          {data.map((d, i) => (
            <ListRow
              key={d.id}
              icon="medkit-outline"
              iconColor={d.freeSlots > 0 ? colors.primary : colors.textSubtle}
              title={d.fullName}
              subtitle={
                d.nextSlot
                  ? t('care.doctors.next', { when: `${formatDay(d.nextSlot)} ${formatTime(d.nextSlot)}`, count: d.freeSlots })
                  : t('care.doctors.noSlots')
              }
              right={<Badge label={t('consent.grant.verified')} color={colors.success} />}
              enterIndex={i}
              onPress={
                d.freeSlots > 0
                  ? () => router.push({ pathname: '/patient/book/[doctorId]', params: { doctorId: d.id, specialtyId: id, doctorName: d.fullName } })
                  : undefined
              }
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ card: { gap: spacing.sm }, list: { gap: spacing.sm } });
