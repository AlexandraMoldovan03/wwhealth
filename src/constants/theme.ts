/**
 * DESIGN SYSTEM — the single source of truth for every visual value.
 *
 * Want a different brand colour? Change `brand` below. That's it.
 * Never hard-code colours, sizes or spacing inside components — import from here.
 */

/** Raw palette. Only referenced inside this file. */
const palette = {
  brand: '#09675A', // ← primary colour of the whole app (WWHealth deep teal)
  brandDark: '#2DD4BF', // brighter variant used in dark mode
  brandActive: '#0F766E', // active tab / links

  mint50: '#F5FEFA', // card tint
  mint100: '#E0FFF3', // screen background (light)
  mint200: '#C2F0E3', // wave decoration (light)
  mint300: '#CDEFE4', // card borders
  mintText: '#4F6F6A', // muted text on mint
  mintSubtle: '#A3B1C2', // inactive tab / placeholder / icons
  ink: '#153F55', // body text on mint

  night900: '#16262F', // screen background (dark)
  night800: '#1F2F3C', // card surface (dark)
  night700: '#2A3E4C', // borders (dark)
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
  /** Dark filled hero card (e.g. "Medical Passport"). */
  hero: string;
  onHero: string;
  /** Translucent pill button that sits on the hero card. */
  heroPill: string;
  /** Decorative wave / lungs artwork behind screens. */
  decoration: string;
}

export const lightColors: ThemeColors = {
  primary: palette.brand,
  primaryMuted: 'rgba(9, 103, 90, 0.10)',
  onPrimary: palette.white,
  accent: palette.accent,
  background: palette.mint100,
  surface: palette.white,
  surfaceAlt: palette.mint50,
  border: palette.mint300,
  text: palette.ink,
  textMuted: palette.mintText,
  textSubtle: palette.mintSubtle,
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  onDanger: palette.white,
  info: palette.blue,
  tabBar: palette.white,
  overlay: 'rgba(15, 23, 42, 0.5)',
  hero: palette.brand,
  onHero: palette.white,
  heroPill: 'rgba(255, 255, 255, 0.78)',
  decoration: palette.mint200,
};

export const darkColors: ThemeColors = {
  primary: palette.brandDark,
  primaryMuted: 'rgba(45, 212, 191, 0.16)',
  onPrimary: palette.gray950,
  accent: palette.accent,
  background: palette.night900,
  surface: palette.night800,
  surfaceAlt: palette.night900,
  border: palette.night700,
  text: palette.gray50,
  textMuted: palette.gray400,
  textSubtle: palette.gray500,
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  onDanger: palette.white,
  info: palette.blue,
  tabBar: palette.night800,
  overlay: 'rgba(0, 0, 0, 0.6)',
  hero: palette.brand,
  onHero: palette.white,
  heroPill: 'rgba(255, 255, 255, 0.18)',
  decoration: '#1F4B52',
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
  /** Stronger drop shadow under the dark hero card. */
  hero: {
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/** Animation durations (ms). */
export const motion = {
  fast: 150,
  normal: 250,
} as const;
