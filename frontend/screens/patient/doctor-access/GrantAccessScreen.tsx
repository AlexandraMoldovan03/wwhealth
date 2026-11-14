import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader, SegmentedControl } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { DoctorScope, GrantDurationHours, VerifiedDoctor } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

const SCOPES: DoctorScope[] = ['profile', 'documents', 'labs'];
const DURATIONS = ['1', '24', '168'] as const;

/**
 * Grant a verified doctor access: pick from the directory (name) or type their code, choose the sections and
 * the duration. The backend re-validates everything (verified doctor, sections, 1 h / 24 h / 7 d).
 */
export function GrantAccessScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [doctors, setDoctors] = useState<VerifiedDoctor[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerifiedDoctor | null>(null);
  const [scopes, setScopes] = useState<DoctorScope[]>(['profile']);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>('24');
  const grant = useSubmit(api.grantDoctorAccess);

  useEffect(() => {
    let alive = true;
    setDoctors(null);
    setSearchError(null);
    const timer = setTimeout(() => {
      api
        .searchDoctors(query.trim())
        .then((res) => alive && setDoctors(res))
        .catch((err) => alive && setSearchError(getErrorMessage(err)));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const toggle = (s: DoctorScope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const submit = async () => {
    if (!selected) return;
    const res = await grant.run({ doctorId: selected.id, scopes, durationHours: Number(duration) as GrantDurationHours });
    if (res) {
      if (router.canGoBack()) router.back();
      else router.replace('/patient/doctor-access');
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.section}>
        <SectionHeader title={t('consent.grant.doctor')} subtitle={t('consent.grant.doctorHint')} />
        <AppInput
          icon="search-outline"
          placeholder={t('consent.grant.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
        />
        {searchError ? (
          <ErrorState compact message={searchError} />
        ) : doctors === null ? (
          <LoadingState count={1} />
        ) : doctors.length === 0 ? (
          <EmptyState icon="person-outline" title={t('consent.grant.noDoctors')} message={t('consent.grant.noDoctorsHint')} />
        ) : (
          doctors.map((d) => (
            <ListRow
              key={d.id}
              icon="medkit-outline"
              iconColor={colors.accent}
              title={d.fullName}
              subtitle={`${t('consent.grant.verified')} · ${d.doctorCode}`}
              onPress={() => setSelected(d)}
              right={
                <Ionicons
                  name={selected?.id === d.id ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected?.id === d.id ? colors.primary : colors.textSubtle}
                />
              }
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.grant.sections')} subtitle={t('consent.grant.sectionsHint')} />
        <AppCard style={styles.list}>
          {SCOPES.map((s) => (
            <View key={s} style={styles.scopeRow}>
              <View style={styles.flex}>
                <AppText>{t(`consent.scopes.${s}`)}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t(`consent.scopeHints.${s}`)}
                </AppText>
              </View>
              <Switch
                value={scopes.includes(s)}
                onValueChange={() => toggle(s)}
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityLabel={t(`consent.scopes.${s}`)}
              />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.grant.duration')} />
        <SegmentedControl options={DURATIONS} value={duration} onChange={setDuration} getLabel={(d) => t(`consent.durations.${d}`)} />
      </View>

      {selected && scopes.length > 0 && (
        <AppText variant="caption" color="textMuted">
          {t('consent.grant.confirmText', {
            doctor: selected.fullName,
            sections: scopes.map((s) => t(`consent.scopes.${s}`)).join(', '),
            duration: t(`consent.durations.${duration}`),
          })}
        </AppText>
      )}
      <AppButton
        title={t('consent.grant.submit')}
        icon="shield-checkmark-outline"
        fullWidth
        disabled={!selected || scopes.length === 0}
        loading={grant.isLoading}
        onPress={submit}
      />
      {grant.error && <ErrorState message={grant.error} />}
      <AppText variant="caption" color="textSubtle">
        {t('consent.grant.emergencyNote')}
      </AppText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
});
