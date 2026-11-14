import { StyleSheet, Text, type TextProps } from 'react-native';

import { typography, type TypographyVariant } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

type TextColor = 'text' | 'textMuted' | 'textSubtle' | 'primary' | 'onPrimary' | 'onInk' | 'accent' | 'success' | 'warning' | 'danger';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
}

/** All text in the app goes through this component so typography stays consistent. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color: colors[color] }, align && { textAlign: align }, variant === 'label' && styles.upper, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  upper: { textTransform: 'uppercase' },
});
