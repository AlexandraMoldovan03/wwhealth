import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Avatar, Badge, ScreenContainer, SectionHeader } from '@/design-system';
import { APP_INFO } from '@/config/config';
import { radius, spacing } from '@/design-system/theme';
import { logout } from '@/services/auth/authService';
import { setChecklistHidden } from '@/screens/patient/dashboard/progressStorage';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { SettingsRow } from './components/SettingsRow';
import { LanguageSelector } from './components/LanguageSelector';
import { ThemeSelector } from './components/ThemeSelector';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

export function SettingsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScreenContainer help="profile" showBackgroundLungs={false}>
      <AppText variant="title" accessibilityRole="header">
        {t('settings.title')}
      </AppText>

      {user && (
        <View style={styles.profile}>
          <LinearGradient
            colors={[colors.accentMuted, colors.primaryMuted, 'transparent']}
            pointerEvents="none"
            style={styles.profileGlow}
          />
          <View style={[styles.avatarRing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Avatar name={user.fullName || user.email} size={80} tone={user.role === 'doctor' ? 'accent' : 'primary'} />
          </View>
          <AppCard style={styles.identity} enterIndex={0}>
            <AppText variant="heading" align="center">
              {user.fullName || t('settings.signedIn')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center" selectable>
              {user.email}
            </AppText>
            <Badge label={t('roles.' + user.role)} color={user.role === 'doctor' ? colors.accent : colors.primary} />
          </AppCard>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader title={t('settings.account')} />
        <AppCard style={styles.group}>
          {user ? (
            <>
              <SettingsRow
                icon={user.role === 'doctor' ? 'medkit-outline' : 'person-outline'}
                title={t('settings.activeRole')}
                value={t(`roles.${user.role}`)}
              />
              {user.role === 'patient' && (
                <SettingsRow icon="document-text-outline" title={t('settings.medicalProfile')} onPress={() => router.push('/patient/profile')} />
              )}
              {user.role === 'patient' && (
                <SettingsRow icon="shield-checkmark-outline" title={t('settings.doctorAccess')} onPress={() => router.push('/patient/doctor-access')} />
              )}
              {user.role === 'patient' && (
                <SettingsRow icon="medkit-outline" title={t('settings.emergencyPassport')} onPress={() => router.push('/patient/emergency')} />
              )}
              {user.role === 'patient' && (
                <SettingsRow
                  icon="checkbox-outline"
                  title={t('progress.showAgain')}
                  onPress={() => {
                    void setChecklistHidden(user.id, false);
                    router.navigate('/');
                  }}
                />
              )}
              <SettingsRow icon="lock-closed-outline" title={t('settings.security')} onPress={() => router.push('/security')} />
              <SettingsRow icon="compass-outline" title={t('settings.allFeatures')} onPress={() => router.navigate('/explore')} />
              <SettingsRow icon="sparkles-outline" title={t('settings.replayOnboarding')} onPress={() => router.push('/onboarding')} />
              <SettingsRow icon="log-out-outline" title={t('settings.signOut')} onPress={signOut} />
            </>
          ) : (
            <>
              <SettingsRow icon="log-in-outline" title={t('common.signIn')} onPress={() => router.push('/login')} />
              <SettingsRow icon="person-add-outline" title={t('common.createAccount')} onPress={() => router.push('/register')} />
            </>
          )}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.appearance')} />
        <AppCard style={[styles.group, styles.card]}>
          <AppText variant="caption" color="textMuted">
            {t('settings.theme')}
          </AppText>
          <ThemeSelector />
          <AppText variant="caption" color="textMuted">
            {t('settings.language')}
          </AppText>
          <LanguageSelector />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.about')} />
        <AppCard style={styles.group}>
          <SettingsRow icon="information-circle-outline" title={APP_INFO.name} value={`v${APP_INFO.version}`} />
          <AppText variant="caption" color="textMuted" style={styles.about}>
            {t('app.description')}
          </AppText>
        </AppCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  profile: { alignItems: 'center', paddingTop: spacing.md },
  profileGlow: { ...StyleSheet.absoluteFill, borderRadius: radius.xl },
  avatarRing: { padding: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, zIndex: 1 },
  identity: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -spacing.md,
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.lg,
    borderRadius: radius.xl,
  },
  group: { borderRadius: radius.xl, paddingVertical: spacing.xs },
  card: { gap: spacing.sm, paddingVertical: spacing.md },
  about: { paddingVertical: spacing.sm },
});
