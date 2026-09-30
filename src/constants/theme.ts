import { Platform } from 'react-native';

/** gluciq is dark-first. Functional colors are used sparingly. */
export const colors = {
  background: '#050505',
  surface: '#111111',
  card: '#161616',
  elevated: '#1C1C1E',
  elevatedHigh: '#242426',

  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textMuted: '#636366',

  border: 'rgba(255,255,255,0.12)',
  borderSubtle: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.05)',

  chartPrimary: '#FFFFFF',
  chartSecondary: 'rgba(255,255,255,0.28)',
  chartGrid: 'rgba(255,255,255,0.06)',
  rangeBand: 'rgba(255,255,255,0.035)',

  green: '#34C759',
  orange: '#FF9F0A',
  red: '#FF453A',
  greenSoft: 'rgba(52,199,89,0.14)',
  orangeSoft: 'rgba(255,159,10,0.14)',
  redSoft: 'rgba(255,69,58,0.14)',

  glass: 'rgba(22,22,22,0.72)',
  scrim: 'rgba(0,0,0,0.6)',
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
  huge: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 28,
  xxl: 32,
  pill: 999,
} as const;

export const fontFamily = Platform.select({
  ios: { sans: 'System', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: {
    sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif",
    rounded: "'SF Pro Rounded', ui-rounded, -apple-system, sans-serif",
    mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  },
  default: { sans: 'sans-serif', rounded: 'sans-serif', mono: 'monospace' },
});

/** Type scale. Metrics dominate; labels stay small and muted. */
export const type = {
  display: { fontSize: 88, lineHeight: 92, fontWeight: '700', letterSpacing: -4 },
  metricXL: { fontSize: 64, lineHeight: 68, fontWeight: '700', letterSpacing: -2.5 },
  metricL: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.5 },
  metricM: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: -0.2 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: -0.1 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.1 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase' },
} as const;

export type TypeVariant = keyof typeof type;

export const layout = {
  screenPadding: 20,
  /** Space reserved at the bottom of scroll views for the floating tab bar. */
  tabBarClearance: 120,
  maxContentWidth: 560,
} as const;

export const toneColor = {
  positive: colors.green,
  attention: colors.orange,
  neutral: colors.textSecondary,
  critical: colors.red,
} as const;
