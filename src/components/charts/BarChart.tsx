import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Text } from '@/components/typography/Text';
import { colors, spacing } from '@/constants/theme';

export type Bar = { label: string; value: number | null; highlight?: boolean };

/** Minimal vertical bars — used for the average-day profile. */
export function BarChart({
  bars,
  height = 120,
  band,
  maxValue,
}: {
  bars: Bar[];
  height?: number;
  band?: { low: number; high: number };
  maxValue?: number;
}) {
  const [width, setWidth] = useState(0);
  const max = maxValue ?? Math.max(1, ...bars.map((b) => b.value ?? 0));
  const gap = 3;
  const bw = width ? (width - gap * (bars.length - 1)) / bars.length : 0;
  const y = (v: number) => height - (v / max) * height;

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          <Svg width={width} height={height}>
            {band ? (
              <>
                <Line x1={0} x2={width} y1={y(band.high)} y2={y(band.high)} stroke={colors.chartGrid} strokeDasharray="3 4" />
                <Line x1={0} x2={width} y1={y(band.low)} y2={y(band.low)} stroke={colors.chartGrid} strokeDasharray="3 4" />
              </>
            ) : null}
            {bars.map((b, i) => {
              if (b.value == null) return null;
              const top = y(b.value);
              const over = band && b.value > band.high;
              return (
                <Rect
                  key={i}
                  x={i * (bw + gap)}
                  y={top}
                  width={bw}
                  height={Math.max(2, height - top)}
                  rx={Math.min(3, bw / 2)}
                  fill={b.highlight ? colors.text : over ? 'rgba(255,159,10,0.55)' : 'rgba(255,255,255,0.22)'}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        {bars.map((b, i) =>
          b.label ? (
            <Text
              key={i}
              variant="caption"
              color="muted"
              style={[styles.label, { left: i * (bw + gap) + bw / 2 - 16 }]}>
              {b.label}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { height: 18, marginTop: spacing.sm },
  label: { position: 'absolute', width: 32, textAlign: 'center' },
});
