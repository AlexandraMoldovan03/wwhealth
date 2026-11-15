import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText, Avatar, Badge, enterUp } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

/** Avatar + greeting + role badge, then a large headline. */
export function WelcomeHeader({
  name,
  roleLabel,
  headline,
  tone = 'primary',
}: {
  name: string;
  roleLabel?: string;
  headline?: string;
  tone?: 'primary' | 'accent';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Animated.View entering={enterUp()} style={styles.container}>
      <View style={styles.row}>
        <Avatar name={name} tone={tone} />
        <View style={styles.flex}>
          <AppText variant="caption" color="textMuted">
            {t('home.greeting.welcome')}
          </AppText>
          <AppText variant="heading" numberOfLines={1}>
            {name}
          </AppText>
        </View>
        {roleLabel && <Badge label={roleLabel} color={tone === 'accent' ? colors.accent : colors.primary} />}
      </View>
      {headline && (
        <AppText variant="display" accessibilityRole="header">
          {headline}
        </AppText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
