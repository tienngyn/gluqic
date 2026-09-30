import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export type NumberFieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  unit?: string;
  hint?: string;
  error?: string;
  /** Large inline metric input vs compact row. */
  size?: 'l' | 'm';
  decimal?: boolean;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

/** Accepts "7,5" and "7.5"; strips anything else. */
export function sanitizeNumber(input: string, decimal = true): string {
  const normalized = input.replace(',', '.');
  const cleaned = normalized.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
}

export function parseNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Tabular figures make width predictable: ~0.6em per glyph. */
function contentWidth(text: string, large: boolean): number {
  const em = large ? 44 : 24;
  return Math.max(1, text.length) * em * 0.6 + 4;
}

export function NumberField({
  label,
  value,
  onChangeText,
  onBlur,
  unit,
  hint,
  error,
  size = 'm',
  decimal = true,
  placeholder = '0',
  style,
  autoFocus,
  accessibilityLabel,
}: NumberFieldProps) {
  const [focused, setFocused] = useState(false);
  const large = size === 'l';
  return (
    <View style={[styles.wrap, large ? styles.wrapLarge : styles.wrapMedium, focused && styles.focused, !!error && styles.errored, style]}>
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={(t) => onChangeText(sanitizeNumber(t, decimal))}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.text}
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel ?? label}
          // Size to content so the unit sits right after the number.
          style={[styles.input, large ? styles.inputLarge : styles.inputMedium, { width: contentWidth(value || placeholder, large) }]}
        />
        {unit ? (
          <Text variant={large ? 'body' : 'callout'} color="secondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="red">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, styles.wrapMedium, focused && styles.focused]}>
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.text}
        multiline={multiline}
        accessibilityLabel={label}
        style={[styles.input, styles.textInput, multiline && { minHeight: 64, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  wrapLarge: { padding: spacing.xl },
  wrapMedium: { paddingHorizontal: spacing.lg + 2, paddingVertical: spacing.md + 2 },
  focused: { borderColor: 'rgba(255,255,255,0.35)' },
  errored: { borderColor: 'rgba(255,69,58,0.6)' },
  inputRow: { flexDirection: 'row', alignItems: 'baseline' },
  input: {
    color: colors.text,
    padding: 0,
    margin: 0,
    fontVariant: ['tabular-nums'],
    fontFamily: fontFamily.sans,
    // Web only: hide the browser focus ring; the field border shows focus instead.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null),
  },
  inputLarge: { fontSize: 44, lineHeight: 52, fontWeight: '700', letterSpacing: -1.5, flexShrink: 1, maxWidth: '80%' },
  inputMedium: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.5, flexShrink: 1, maxWidth: '75%' },
  textInput: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  unit: { marginLeft: spacing.sm },
});
