import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { SUPABASE_URL, USE_MOCKS } from '@/config/config';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';

const loadHealth = () => api.health();
const projectRef = (url: string) => url.match(/^https?:\/\/([^./]+)\./i)?.[1] ?? null;

/**
 * Invitations sync between phones only when both apps talk to a backend that uses the SAME Supabase project.
 * Warns when this app runs on mock data, the server runs in demo (in-memory) mode, or the projects differ.
 */
export function SyncNotice() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const health = useAsync(loadHealth, { immediate: !USE_MOCKS });
  const appProject = projectRef(SUPABASE_URL);
  const server = health.data;

  let warning: string | null = null;
  if (USE_MOCKS) warning = t('guardians.sync.mock');
  else if (server?.dataMode === 'demo') warning = t('guardians.sync.serverDemo');
  else if (server?.supabaseProject && appProject && server.supabaseProject !== appProject) {
    warning = t('guardians.sync.mismatch', { app: appProject, server: server.supabaseProject });
  }

  if (warning) {
    return (
      <AppCard style={[styles.card, { borderColor: colors.warning }]}>
        <View style={styles.row}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <AppText variant="subheading" color="warning" style={styles.flex}>{t('guardians.sync.title')}</AppText>
        </View>
        <AppText variant="caption" color="textMuted">{warning}</AppText>
      </AppCard>
    );
  }
  if (!server?.supabaseProject) return null;
  return (
    <View style={styles.row}>
      <Ionicons name="cloud-done-outline" size={14} color={colors.success} />
      <AppText variant="caption" color="textMuted">{t('guardians.sync.ok', { project: server.supabaseProject })}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
