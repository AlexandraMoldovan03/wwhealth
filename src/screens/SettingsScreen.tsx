import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { AppCard, AppText, ScreenContainer, SectionHeader } from '@/components/ui';
import { API_BASE_URL, APP_INFO, USE_MOCKS } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { logout } from '@/features/auth/authService';
import { useSession } from '@/features/auth/sessionStore';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { ThemeSelector } from '@/features/settings/components/ThemeSelector';
import { useTheme } from '@/hooks/useTheme';
import { realApi } from '@/services/api/realApi';
import { getErrorMessage } from '@/utils/errors';

export function SettingsScreen() {
  const { colors } = useTheme();
  const { user, isAuthenticated } = useSession();
  const [notifications, setNotifications] = useState(true);
  const [checking, setChecking] = useState(false);

  const testConnection = async () => {
    setChecking(true);
    try {
      // Always hits the real backend, even in MOCK mode.
      const res = await realApi.health();
      Alert.alert('Backend reachable', `Status: ${res.status} · v${res.version}`);
    } catch (err) {
      Alert.alert('Connection failed', getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScreenContainer>
      <AppText variant="title">Settings</AppText>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <AppCard>
          {isAuthenticated ? (
            <>
              <SettingsRow
                icon="person-circle-outline"
                title={user?.fullName || 'Signed in'}
                value={user?.role === 'doctor' ? 'Doctor' : 'Patient'}
              />
              <SettingsRow icon="log-out-outline" title="Sign out" onPress={() => void logout()} />
            </>
          ) : (
            <>
              <SettingsRow icon="log-in-outline" title="Sign in" onPress={() => router.push('/login')} />
              <SettingsRow icon="person-add-outline" title="Create account" onPress={() => router.push('/register')} />
            </>
          )}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Appearance" />
        <AppCard style={styles.card}>
          <AppText variant="caption" color="textMuted">
            Theme
          </AppText>
          <ThemeSelector />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="General" />
        <AppCard>
          <SettingsRow
            icon="notifications-outline"
            title="Notifications"
            right={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            }
          />
          <SettingsRow icon="language-outline" title="Language" value="English" />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Backend" subtitle="Configured in .env → src/constants/config.ts" />
        <AppCard>
          <SettingsRow icon="server-outline" title="API URL" value={API_BASE_URL} />
          <SettingsRow icon="flask-outline" title="Data source" value={USE_MOCKS ? 'MOCK (demo data)' : 'API (FastAPI)'} />
          <SettingsRow
            icon="pulse-outline"
            title={checking ? 'Checking…' : 'Test connection'}
            onPress={checking ? undefined : testConnection}
          />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Role" subtitle="Demo switch until Auth0 roles are implemented" />
        <AppCard>
          <SettingsRow icon="person-outline" title="Patient area" value="Tabs" />
          <SettingsRow icon="medkit-outline" title="Doctor Dashboard" onPress={() => router.push('/doctor')} />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Integrations" subtitle="Configured on the backend — not in the app" />
        <AppCard>
          <SettingsRow icon="shield-checkmark-outline" title="Auth0 login" value="Not connected" />
          <SettingsRow icon="scan-outline" title="LungVision model" value="DenseNet121 (demo)" />
          <SettingsRow icon="sparkles-outline" title="Gemini extraction" value="Backend" />
          <SettingsRow icon="volume-high-outline" title="ElevenLabs voice" value="Backend" />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="About" />
        <AppCard>
          <SettingsRow icon="information-circle-outline" title={APP_INFO.name} value={`v${APP_INFO.version}`} />
          <AppText variant="caption" color="textMuted" style={styles.about}>
            {APP_INFO.description}
          </AppText>
        </AppCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  about: { paddingTop: spacing.xs },
});
