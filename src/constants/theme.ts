/**
 * DESIGN SYSTEM — the single source of truth for every visual value.
 *
 * Want a different brand colour? Change `brand` below. That's it.
 * Never hard-code colours, sizes or spacing inside components — import from here.
 */

/** Raw palette. Only referenced inside this file. */
const palette = {
  brand: '#0F766E', // ← primary colour of the whole app (WWHealth teal)
  brandDark: '#2DD4BF', // brighter variant used in dark mode
  accent: '#2563EB',

  white: '#FFFFFF',
  black: '#000000',

  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  gray950: '#0B1120',

  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
} as const;

/** Semantic colour tokens. Components use these names, never the palette. */
export interface ThemeColors {
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  info: string;
  tabBar: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  primary: palette.brand,
  primaryMuted: 'rgba(15, 118, 110, 0.12)',
  onPrimary: palette.white,
  accent: palette.accent,
  background: palette.gray50,
  surface: palette.white,
  surfaceAlt: palette.gray100,
  border: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray500,
  textSubtle: palette.gray400,
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  onDanger: palette.white,
  info: palette.blue,
  tabBar: palette.white,
  overlay: 'rgba(15, 23, 42, 0.5)',
};

export const darkColors: ThemeColors = {
  primary: palette.brandDark,
  primaryMuted: 'rgba(45, 212, 191, 0.16)',
  onPrimary: palette.gray950,
  accent: palette.accent,
  background: palette.gray950,
  surface: palette.gray900,
  surfaceAlt: palette.gray800,
  border: palette.gray800,
  text: palette.gray50,
  textMuted: palette.gray400,
  textSubtle: palette.gray500,
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  onDanger: palette.white,
  info: palette.blue,
  tabBar: palette.gray900,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/** Spacing scale (4pt grid). Use `spacing.md` instead of `16`. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Typography variants used by <AppText variant="..."/>. */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Icon sizes. */
export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/** Fixed component sizes. */
export const sizes = {
  buttonHeight: 50,
  buttonHeightSmall: 38,
  inputHeight: 48,
  iconBadge: 44,
  maxContentWidth: 640, // keeps layouts readable on tablets / web
} as const;

/** Subtle elevation for cards. */
export const shadows = {
  card: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;

/** Animation durations (ms). */
export const motion = {
  fast: 150,
  normal: 250,
} as const;
