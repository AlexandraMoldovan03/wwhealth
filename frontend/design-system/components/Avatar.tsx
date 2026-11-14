import { StyleSheet, View } from 'react-native';

import { fonts, radius } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { AppText } from './AppText';

/** Initials in a soft circle (no photos stored → nothing sensitive). */
export function Avatar({ name, size = 48, tone = 'primary' }: { name: string; size?: number; tone?: 'primary' | 'accent' }) {
  const { colors } = useTheme();
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '•';
  return (
    <View
      accessible={false}
      style={[
        styles.circle,
        { width: size, height: size, backgroundColor: tone === 'accent' ? colors.accentMuted : colors.primaryMuted },
      ]}
    >
      <AppText style={{ fontFamily: fonts.heading, fontSize: size * 0.36, color: tone === 'accent' ? colors.accent : colors.primary }}>
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
