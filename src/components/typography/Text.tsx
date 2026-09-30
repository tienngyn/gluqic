import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, fontFamily, type, type TypeVariant } from '@/constants/theme';

export type TextColor = 'primary' | 'secondary' | 'muted' | 'green' | 'orange' | 'red' | 'inverse';

const colorMap: Record<TextColor, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  green: colors.green,
  orange: colors.orange,
  red: colors.red,
  inverse: '#000000',
};

const NUMERIC: TypeVariant[] = ['display', 'metricXL', 'metricL', 'metricM'];

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /** Use tabular figures so changing numbers don't jitter. */
  tabular?: boolean;
};

export function Text({ variant = 'body', color = 'primary', align, tabular, style, ...rest }: TextProps) {
  const numeric = tabular ?? NUMERIC.includes(variant);
  return (
    <RNText
      {...rest}
      style={[
        type[variant] as TextStyle,
        { color: colorMap[color] },
        Platform.OS === 'web' && { fontFamily: fontFamily.sans },
        numeric && { fontVariant: ['tabular-nums'] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
