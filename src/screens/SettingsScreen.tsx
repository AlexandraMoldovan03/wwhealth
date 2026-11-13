import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { AppCard, AppText, ScreenContainer, SectionHeader } from '@/components/ui';
import { API_BASE_URL, APP_INFO, USE_MOCK_API } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { ThemeSelector } from '@/features/settings/components/ThemeSelector';
import { useTheme } from '@/hooks/useTheme';
import { checkBackendHealth } from '@/services/healthService';
import { getErrorMessage } from '@/utils/errors';

export function SettingsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [checking, setChecking] = useState(false);

  const testConnection = async () => {
    setChecking(true);
    try {
      const res = await checkBackendHealth();
      Alert.alert('Backend reachable', `Status: ${res.status}`);
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
          <SettingsRow icon="flask-outline" title="Data source" value={USE_MOCK_API ? 'Mock (demo)' : 'Live API'} />
          <SettingsRow
            icon="pulse-outline"
            title={checking ? 'Checking…' : 'Test connection'}
            onPress={checking ? undefined : testConnection}
          />
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Future configuration" subtitle="Placeholders for your hackathon features" />
        <AppCard>
          <SettingsRow icon="hardware-chip-outline" title="AI model" value="demo-model-v0" />
          <SettingsRow icon="person-circle-outline" title="Account (Supabase)" value="Not connected" />
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
