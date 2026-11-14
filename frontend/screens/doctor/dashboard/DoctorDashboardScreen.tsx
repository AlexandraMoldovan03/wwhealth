import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppCard,
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
import { GrantStatusBadge } from '@/screens/shared/components/ConsentBadges';
import { EmergencyAuditList } from '@/screens/shared/components/EmergencyAuditList';
import { WelcomeHeader } from '@/screens/shared/components/WelcomeHeader';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const listPatients = () => api.listDoctorPatients();
// Only the number of pending requests is used here (names are language-independent).
const listAppointments = () => api.listDoctorAppointments('en');
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Doctor Dashboard — Home tab for accounts with role `doctor` in Supabase (also at /doctor).
 * Primary action: scan a patient's Emergency Passport QR. Numbers come from the doctor's own access log.
 */
export function DoctorDashboardScreen({ inTab = false }: { inTab?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const accesses = useAsync(api.getMyEmergencyAccesses, { refetchOnFocus: true });
  const patients = useAsync(listPatients, { refetchOnFocus: true });
  const identity = useAsync(api.getDoctorIdentity);
  const appointments = useAsync(listAppointments, { refetchOnFocus: true });
  const pending = appointments.data?.filter((a) => a.status === 'requested').length;

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
    <ScreenContainer help="doctorHome"
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

      <ListRow
        icon="calendar-outline"
        iconColor={colors.primary}
        title={t('care.doctor.entry')}
        subtitle={pending ? t('care.doctor.pending', { count: pending }) : t('care.doctor.entryHint')}
        right={pending ? <Badge label={String(pending)} color={colors.warning} /> : undefined}
        enterIndex={2}
        onPress={() => router.push('/doctor/appointments')}
      />

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
        <SectionHeader
          title={t('consent.doctor.dashboardTitle')}
          subtitle={t('consent.doctor.dashboardSubtitle')}
          actionLabel={t('home.seeAll')}
          onActionPress={() => router.navigate('/patients')}
        />
        {patients.error && !patients.data ? (
          <ErrorState compact message={patients.error} onRetry={patients.reload} />
        ) : !patients.data ? (
          <LoadingState count={1} />
        ) : patients.data.length === 0 ? (
          <AppCard>
            <AppText color="textMuted">{t('consent.doctor.noPatientsHint')}</AppText>
          </AppCard>
        ) : (
          patients.data.slice(0, 3).map((p) => (
            <ListRow
              key={p.grantId}
              icon="person-outline"
              title={p.fullName || t('consent.doctor.thePatient')}
              subtitle={t('consent.until', { date: formatDateTime(p.expiresAt) })}
              right={<GrantStatusBadge status={p.status} />}
              onPress={() => router.push({ pathname: '/doctor/patient/[id]', params: { id: p.patientId } })}
            />
          ))
        )}
        {identity.data?.doctorCode && (
          <AppCard style={styles.code}>
            <AppText variant="caption" color="textMuted">
              {t('consent.doctor.yourCode')}
            </AppText>
            <AppText variant="title" selectable>
              {identity.data.doctorCode}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {t('consent.doctor.yourCodeHint')}
            </AppText>
          </AppCard>
        )}
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
  code: { gap: spacing.xxs },
  white: { color: '#FFFFFF' },
  soft: { color: 'rgba(255,255,255,0.88)' },
});
