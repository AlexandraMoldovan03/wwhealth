import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { tapFeedback } from '@/design-system/motion';
import { radius } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

import type { HelpTopic } from './helpRegistry';
import { useHelp } from './HelpProvider';

/** The (?) button: opens the help sheet of the current screen. */
export function HelpButton({ topic }: { topic: HelpTopic }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { openHelp } = useHelp();
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        openHelp(topic);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('help.open')}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="help" size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
