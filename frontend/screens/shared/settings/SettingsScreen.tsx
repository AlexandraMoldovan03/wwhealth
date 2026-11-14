import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppCard, AppText, Avatar, Badge, ScreenContainer, SectionHeader } from '@/design-system';
import { API_BASE_URL, APP_INFO, SUPABASE_ENABLED, USE_MOCKS } from '@/config/config';
import { spacing } from '@/design-system/theme';
import { logout } from '@/services/auth/authService';
import { setChecklistHidden } from '@/screens/patient/dashboard/progressStorage';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { SettingsRow } from './components/SettingsRow';
import { LanguageSelector } from './components/LanguageSelector';
import { ThemeSelector } from './components/ThemeSelector';
import { useTheme } from '@/design-system/useTheme';
import { realApi } from '@/services/api/realApi';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

export function SettingsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const user = useCurrentUser();

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  const testConnection = async () => {
    setChecking(true);
    try {
      // Always hits the real backend, even in MOCK mode.
      const res = await realApi.health();
      Alert.alert(t('settings.backendOk'), `Status: ${res.status} · v${res.version}`);
    } catch (err) {
      Alert.alert(t('settings.connectionFailed'), getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScreenContainer help="profile">
      <AppText variant="title" accessibilityRole="header">
        {t('settings.title')}
      </AppText>

      {user && (
        <AppCard style={styles.profile} enterIndex={0}>
          <Avatar name={user.fullName || user.email} size={64} tone={user.role === 'doctor' ? 'accent' : 'primary'} />
          <View style={styles.flex}>
            <AppText variant="heading" numberOfLines={1}>
              {user.fullName || t('settings.signedIn')}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {user.email}
            </AppText>
            {/* Read-only: the role is set in Supabase (public.profiles.role), never from the app. */}
            <Badge label={t(`roles.${user.role}`)} color={user.role === 'doctor' ? colors.accent : colors.primary} />
          </View>
        </AppCard>
      )}

      <View style={styles.section}>
        <SectionHeader title={t('settings.account')} />
        <AppCard>
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
        <AppCard style={styles.card}>
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
        <SectionHeader title={t('settings.backend')} subtitle={t('settings.backendSubtitle')} />
        <AppCard>
          <SettingsRow icon="server-outline" title={t('settings.apiUrl')} value={API_BASE_URL} />
          <SettingsRow icon="flask-outline" title={t('settings.dataSource')} value={USE_MOCKS ? t('settings.dataMock') : t('settings.dataApi')} />
          <SettingsRow
            icon="pulse-outline"
            title={checking ? t('settings.checking') : t('settings.testConnection')}
            onPress={checking ? undefined : testConnection}
          />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.integrations')} subtitle={t('settings.integrationsSubtitle')} />
        <AppCard>
          <SettingsRow icon="shield-checkmark-outline" title={t('settings.supabaseLogin')} value={SUPABASE_ENABLED ? t('settings.connected') : t('settings.notConfigured')} />
          <SettingsRow icon="scan-outline" title={t('settings.lungModel')} value="DenseNet121 (demo)" />
          <SettingsRow icon="sparkles-outline" title={t('settings.geminiExtraction')} value="Backend" />
          <SettingsRow icon="volume-high-outline" title={t('settings.elevenLabs')} value="Backend" />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.about')} />
        <AppCard>
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
  section: { gap: spacing.md },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  card: { gap: spacing.sm },
  about: { paddingTop: spacing.xs },
});
