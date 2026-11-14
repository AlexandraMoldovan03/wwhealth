import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { fadeIn } from './motion';
import { StateView } from './StateView';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Inline banner (forms, scanner) instead of the full-page illustration. */
  compact?: boolean;
}

export function ErrorState({ title, message, onRetry, compact = false }: ErrorStateProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (compact) {
    return (
      <Animated.View
        entering={fadeIn()}
        accessibilityRole="alert"
        style={[styles.banner, { backgroundColor: colors.coralMuted, borderColor: colors.coral }]}
      >
        <Ionicons name="alert-circle" size={20} color={colors.danger} style={styles.icon} />
        <View style={styles.text}>
          <AppText variant="subheading">{title ?? t('errors.title')}</AppText>
          {!!message && <AppText variant="caption" color="textMuted">{message}</AppText>}
        </View>
        {onRetry && <AppButton title={t('common.retry')} variant="outline" size="sm" onPress={onRetry} />}
      </Animated.View>
    );
  }

  return (
    <StateView icon="alert-circle-outline" title={title ?? t('errors.title')} message={message} tone="danger">
      {onRetry && <AppButton title={t('common.retry')} variant="outline" size="sm" icon="refresh" onPress={onRetry} />}
    </StateView>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { alignSelf: 'flex-start', marginTop: 1 },
  text: { flex: 1, gap: 2 },
});
