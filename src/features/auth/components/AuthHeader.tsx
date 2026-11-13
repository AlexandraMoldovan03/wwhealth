import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { APP_INFO } from '@/constants/config';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Ionicons name="medkit" size={32} color={colors.onPrimary} />
      </View>
      <AppText variant="caption" color="primary">
        {APP_INFO.name} · {APP_INFO.fullName}
      </AppText>
      <AppText variant="title" style={styles.center}>
        {title}
      </AppText>
      <AppText color="textMuted" style={styles.center}>
        {subtitle}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  logo: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  center: { textAlign: 'center' },
});
