/**
 * DESIGN SYSTEM — the single source of truth for every visual value.
 *
 * WWHealth identity: calm, warm and clinical. Sage green + ivory for the patient experience,
 * deep teal + soft blue for the doctor experience, soft coral for emergency actions.
 * Never hard-code colours, sizes or spacing inside components — import from here.
 */

/** Raw palette. Only referenced inside this file. */
export const palette = {
  sage: '#5E8B7E',
  sageDeep: '#466C61', // AA text contrast on ivory / white
  sageLight: '#8FBFAF',
  softBlue: '#A7C7E7',
  blueDeep: '#3F6E99',
  ivory: '#F7F5F0',
  canvas: '#F6F4FC', // brand background (light) — matches assets/images/background/*-light.png
  ivoryDeep: '#EFEBE2',
  sand: '#E4DED2',
  deepTeal: '#273E46',
  tealInk: '#1C2E34',
  coral: '#E8AEB7',
  coralDeep: '#B9505F', // AA on white for text / emergency buttons
  white: '#FFFFFF',
  black: '#000000',

  slate500: '#5C6B70',
  slate400: '#86959A',

  night: '#121E22',
  canvasNight: '#0F172B', // brand background (dark) — matches assets/images/background/*-dark.png
  night2: '#1A2A30',
  night3: '#223840',
  night4: '#2E4850',

  green: '#3E9B6E',
  amber: '#C98A2B',
} as const;

/** Semantic colour tokens. Components use these names, never the palette. */
export interface ThemeColors {
  primary: string; // sage — brand, icons, links
  primaryMuted: string;
  onPrimary: string;
  ink: string; // deep teal — main buttons, doctor hero
  onInk: string;
  accent: string; // soft blue
  accentMuted: string;
  coral: string; // emergency soft fill
  coralMuted: string;
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
  skeleton: string;
}

export const lightColors: ThemeColors = {
  primary: palette.sageDeep,
  primaryMuted: 'rgba(94, 139, 126, 0.14)',
  onPrimary: palette.white,
  ink: palette.deepTeal,
  onInk: palette.ivory,
  accent: palette.blueDeep,
  accentMuted: 'rgba(167, 199, 231, 0.35)',
  coral: palette.coral,
  coralMuted: 'rgba(232, 174, 183, 0.28)',
  background: palette.canvas,
  surface: palette.white,
  surfaceAlt: palette.ivoryDeep,
  border: palette.sand,
  text: palette.tealInk,
  textMuted: palette.slate500,
  textSubtle: palette.slate400,
  success: palette.green,
  warning: palette.amber,
  danger: palette.coralDeep,
  onDanger: palette.white,
  info: palette.blueDeep,
  tabBar: palette.white,
  overlay: 'rgba(28, 46, 52, 0.55)',
  skeleton: 'rgba(39, 62, 70, 0.08)',
};

export const darkColors: ThemeColors = {
  primary: palette.sageLight,
  primaryMuted: 'rgba(143, 191, 175, 0.16)',
  onPrimary: palette.night,
  ink: palette.sageLight,
  onInk: palette.night,
  accent: palette.softBlue,
  accentMuted: 'rgba(167, 199, 231, 0.16)',
  coral: palette.coral,
  coralMuted: 'rgba(232, 174, 183, 0.16)',
  background: palette.canvasNight,
  surface: palette.night2,
  surfaceAlt: palette.night3,
  border: palette.night4,
  text: '#F2EFE8',
  textMuted: '#A9B7B7',
  textSubtle: '#7C8D90',
  success: '#6CC59A',
  warning: '#E5B566',
  danger: '#F0A0AC',
  onDanger: palette.night,
  info: palette.softBlue,
  tabBar: palette.night2,
  overlay: 'rgba(0, 0, 0, 0.6)',
  skeleton: 'rgba(255, 255, 255, 0.07)',
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

/** Corner radii — soft and generous. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Font families (loaded in app/_layout.tsx). */
export const fonts = {
  heading: 'Inter_700Bold',
  headingSemi: 'Inter_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

/** Typography variants used by <AppText variant="..."/>. */
export const typography = {
  display: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.headingSemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 15, letterSpacing: 0.8 },
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
  buttonHeight: 54,
  buttonHeightSmall: 40,
  inputHeight: 52,
  iconBadge: 44,
  maxContentWidth: 640, // keeps layouts readable on tablets / web
} as const;

/** Soft, warm elevation. */
export const shadows = {
  card: {
    shadowColor: palette.deepTeal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 2,
  },
  raised: {
    shadowColor: palette.deepTeal,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;

/** Animation durations (ms) and the stagger between list items. */
export const motion = {
  fast: 150,
  normal: 250,
  slow: 420,
  stagger: 55,
} as const;

/** Background gradients (expo-linear-gradient). */
export const gradients = {
  patientHero: ['#5E8B7E', '#7FA79A', '#A7C7E7'] as const,
  doctorHero: ['#1C2E34', '#273E46', '#3F6E99'] as const,
  emergency: ['#F2C6CD', '#FBEAE6'] as const, // light coral → dark text on top (AA)
  calm: ['#F7F5F0', '#E9F0EC'] as const,
  calmDark: ['#121E22', '#1A2A30'] as const,
};
