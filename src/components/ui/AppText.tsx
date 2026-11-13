import { StyleSheet, Text, type TextProps } from 'react-native';

import { typography, type TypographyVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type TextColor =
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'primary'
  | 'onPrimary'
  | 'onHero'
  | 'success'
  | 'warning'
  | 'danger';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  /** Defaults to deep teal (primary) for display/title/heading/subheading, normal text colour otherwise. */
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
}

const TEAL_VARIANTS: TypographyVariant[] = ['display', 'title', 'heading', 'subheading'];

/** All text in the app goes through this component so typography stays consistent. */
export function AppText({ variant = 'body', color, align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const resolved: TextColor = color ?? (TEAL_VARIANTS.includes(variant) ? 'primary' : 'text');
  return (
    <Text
      style={[typography[variant], { color: colors[resolved] }, align && { textAlign: align }, variant === 'label' && styles.upper, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  upper: { textTransform: 'uppercase' },
});
