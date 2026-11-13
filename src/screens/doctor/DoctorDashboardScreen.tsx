import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Badge, DemoNotice, EmptyState, ListRow, ScreenContainer, SectionHeader } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { listDoctorSessions } from '@/features/doctor/doctorSession';
import { useTheme } from '@/hooks/useTheme';
import type { AccessRedeemResponse } from '@/types';
import { formatDateTime } from '@/utils/format';

/** Doctor Dashboard — patients currently unlocked via QR passport. */
export function DoctorDashboardScreen() {
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<AccessRedeemResponse[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSessions(listDoctorSessions());
    }, []),
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.header}>
        <AppText variant="title">Doctor Dashboard</AppText>
        <AppText color="textMuted">Scan a patient&apos;s QR Medical Passport to view their record.</AppText>
      </View>
      <DemoNotice message="DEMO role — no doctor login yet. Auth0 with a 'doctor' role will protect this area." />

      <AppButton title="Scan patient QR" icon="scan-circle-outline" fullWidth onPress={() => router.push('/doctor/scan')} />

      <View style={styles.section}>
        <SectionHeader title="Patients with active access" />
        {sessions.length === 0 ? (
          <EmptyState icon="people-outline" title="No active access" message="Scanned patients appear here until access expires." />
        ) : (
          sessions.map((s) => (
            <ListRow
              key={s.accessId}
              icon="person-outline"
              title={s.patient.fullName}
              subtitle={`Until ${formatDateTime(s.expiresAt)}`}
              right={<Badge label={`${s.scopes.length} scopes`} color={colors.primary} />}
              onPress={() => router.push({ pathname: '/doctor/patient/[id]', params: { id: s.patient.id } })}
            />
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  section: { gap: spacing.md },
});
