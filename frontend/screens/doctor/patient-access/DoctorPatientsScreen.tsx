import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppInput, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { GrantStatusBadge } from '@/screens/shared/components/ConsentBadges';
import { api } from '@/services/backend';
import type { DoctorPatient } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Doctor tab "Patients": everyone who granted this doctor access (latest consent each), searchable by name. */
export function DoctorPatientsScreen({ inTab = false }: { inTab?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(() => api.listDoctorPatients(debounced), [debounced]);
  const { data, isLoading, error, reload } = useAsync(load, { refetchOnFocus: true });

  const subtitle = (p: DoctorPatient) =>
    p.status === 'active'
      ? `${p.scopes.map((s) => t(`consent.scopes.${s}`)).join(', ')} · ${t('consent.until', { date: formatDateTime(p.expiresAt) })}`
      : t(`consent.doctor.ended.${p.status}`, { date: formatDateTime(p.revokedAt ?? p.expiresAt) });

  return (
    <ScreenContainer help="doctorPatients"
      edges={inTab ? undefined : ['bottom']}
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}
    >
      {inTab && (
        <View style={styles.header}>
          <AppText variant="title" accessibilityRole="header">
            {t('consent.doctor.patientsTitle')}
          </AppText>
          <AppText color="textMuted">{t('consent.doctor.patientsSubtitle')}</AppText>
        </View>
      )}
      <AppInput
        icon="search-outline"
        placeholder={t('consent.doctor.searchPlaceholder')}
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
      />
      {isLoading && !data && <LoadingState count={3} />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data?.length === 0 && (
        <EmptyState
          icon="people-outline"
          title={debounced ? t('consent.doctor.noMatch') : t('consent.doctor.noPatients')}
          message={debounced ? undefined : t('consent.doctor.noPatientsHint')}
        />
      )}
      <View style={styles.list}>
        {data?.map((p, i) => (
          <ListRow
            key={p.grantId}
            enterIndex={i}
            icon="person-outline"
            iconColor={p.status === 'active' ? colors.primary : colors.textSubtle}
            title={p.fullName || t('consent.doctor.thePatient')}
            subtitle={subtitle(p)}
            right={<GrantStatusBadge status={p.status} />}
            onPress={() => router.push({ pathname: '/doctor/patient/[id]', params: { id: p.patientId } })}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  list: { gap: spacing.sm },
});
