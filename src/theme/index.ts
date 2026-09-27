/**
 * Lifts design tokens.
 *
 * Every screen and component pulls its colors, spacing, radii and type
 * scale from here so the app reads as one coherent, calm surface. Colors
 * are plain 6-digit hex strings so callers can append a 2-digit alpha
 * suffix (e.g. `colors.primary + '26'`) for tinted fills.
 */

export const colors = {
  // Canvas and surfaces, darkest to lightest
  bg: '#09090B',
  surfaceSunken: '#0F0F12',
  surface: '#141417',
  surfaceAlt: '#1B1B1F',
  surfaceHigh: '#232328',
  control: '#2C2C33',

  // Hairlines
  border: '#202025',
  borderStrong: '#2C2C33',

  // Text
  text: '#F4F4F5',
  textSoft: '#D4D4D8',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textFaint: '#52525B',
  white: '#FFFFFF',
  black: '#000000',
  onPrimary: '#FFFFFF',
  onAccent: '#06130B',

  // Brand accent
  primary: '#3F7CFF',
  primaryPressed: '#2F66E0',
  primaryLight: '#8AB0FF',
  primarySoft: '#152241',

  // Semantic accents
  success: '#22C55E',
  successLight: '#86EFAC',
  successSoft: '#0E2A1B',

  warning: '#F5A524',
  gold: '#FBBF24',
  goldLight: '#FDE68A',
  warningSoft: '#2A2011',

  danger: '#F0524D',
  dangerLight: '#FCA5A5',
  dangerSoft: '#2A1415',

  purple: '#9D7BFF',
  purpleLight: '#C4B5FD',
  purpleSoft: '#1E1830',
  purpleBorder: '#4C3A8C',

  overlay: 'rgba(0, 0, 0, 0.72)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const type = {
  largeTitle: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4, color: colors.text },
  headline: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, fontWeight: '500' as const, color: colors.text },
  subhead: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textMuted },
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
} as const;

/** Top padding for screen headers when a safe-area inset is unavailable. */
export const HEADER_TOP_FALLBACK = 54;
