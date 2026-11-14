import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  Badge,
  ErrorState,
  GradientCard,
  ListRow,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  StatTile,
} from '@/design-system';
import { gradients, spacing } from '@/design-system/theme';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { listDoctorSessions } from '@/screens/doctor/patient-access/doctorSession';
import { EmergencyAuditList } from '@/screens/shared/components/EmergencyAuditList';
import { WelcomeHeader } from '@/screens/shared/components/WelcomeHeader';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { AccessRedeemResponse } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Doctor Dashboard — Home tab for accounts with role `doctor` in Supabase (also at /doctor).
 * Primary action: scan a patient's Emergency Passport QR. Numbers come from the doctor's own access log.
 */
export function DoctorDashboardScreen({ inTab = false }: { inTab?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const [sessions, setSessions] = useState<AccessRedeemResponse[]>([]);
  const accesses = useAsync(api.getMyEmergencyAccesses, { refetchOnFocus: true });

  useFocusEffect(
    useCallback(() => {
      setSessions(listDoctorSessions());
    }, []),
  );

  const events = accesses.data;
  const viewed = events?.filter((e) => e.event === 'viewed');
  const stats = [
    { icon: 'today-outline' as const, label: t('doctor.stats.today'), value: viewed?.filter((e) => isToday(e.createdAt)).length, tint: colors.accent },
    { icon: 'eye-outline' as const, label: t('doctor.stats.total'), value: viewed?.length, tint: colors.success },
    { icon: 'shield-outline' as const, label: t('doctor.stats.denied'), value: events?.filter((e) => e.event === 'denied').length, tint: colors.danger },
  ];
  const openScanner = () => router.navigate(inTab ? '/scan' : '/doctor/emergency');
  const name = user?.fullName ? t('doctor.greetingName', { name: user.fullName }) : t('roles.doctor');

  return (
    <ScreenContainer
      edges={inTab ? undefined : ['bottom']}
      refreshControl={<RefreshControl refreshing={accesses.isLoading && !!events} onRefresh={accesses.reload} tintColor={colors.primary} />}
    >
      <WelcomeHeader name={name} roleLabel={t('roles.doctor')} tone="accent" />

      <GradientCard colors={gradients.doctorHero} enterIndex={1}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="qr-code" size={26} color="#273E46" />
          </View>
          <Badge label={t('doctor.emergencyAccess')} color="#A7C7E7" />
        </View>
        <View style={styles.heroText}>
          <AppText variant="title" style={styles.white}>
            {t('doctor.heroTitle')}
          </AppText>
          <AppText variant="caption" style={styles.soft}>
            {t('doctor.scanPatientQrHint')}
          </AppText>
        </View>
        <AppButton
          title={t('doctor.scanPatientQr')}
          icon="scan-outline"
          variant="inverse"
          size="lg"
          fullWidth
          onPress={openScanner}
          accessibilityHint={t('doctor.scanPatientQrHint')}
        />
      </GradientCard>

      <View style={styles.section}>
        <SectionHeader title={t('doctor.stats.title')} />
        {accesses.error && !events ? (
          <ErrorState message={accesses.error} onRetry={accesses.reload} />
        ) : (
          <View style={styles.stats}>
            {stats.map((s, i) => (
              <StatTile key={s.label} {...s} enterIndex={2 + i} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={t('doctor.recentAccesses')}
          actionLabel={inTab ? t('home.seeAll') : undefined}
          onActionPress={inTab ? () => router.navigate('/access') : undefined}
        />
        {!events && accesses.isLoading ? <LoadingState count={2} /> : events && <EmergencyAuditList events={events.slice(0, 3)} perspective="doctor" />}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('doctor.extendedTitle')} subtitle={t('doctor.extendedSubtitle')} />
        <ListRow icon="scan-circle-outline" iconColor={colors.accent} title={t('doctor.scan')} onPress={() => router.push('/doctor/scan')} />
        {sessions.map((s) => (
          <ListRow
            key={s.accessId}
            icon="person-outline"
            title={s.patient.fullName}
            subtitle={t('doctor.until', { date: formatDateTime(s.expiresAt) })}
            right={<Badge label={t('doctor.scopesCount', { count: s.scopes.length })} color={colors.primary} />}
            onPress={() => router.push({ pathname: '/doctor/patient/[id]', params: { id: s.patient.id } })}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#A7C7E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { gap: spacing.xs },
  white: { color: '#FFFFFF' },
  soft: { color: 'rgba(255,255,255,0.88)' },
});
