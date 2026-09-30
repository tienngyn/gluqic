import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/typography/Text';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

import { downsample, extent, monotonePath, nearestIndex, type Point } from './path';

export type LineChartProps = {
  data: Point[];
  /** Muted comparison series on the same x domain. */
  secondary?: Point[];
  /** Individual points drawn over the line, e.g. values typed in by hand. */
  markers?: (Point & { color?: string })[];
  height?: number;
  /** Subtle horizontal band, e.g. the target range. */
  band?: { low: number; high: number };
  yDomain?: [number, number];
  xDomain?: [number, number];
  interactive?: boolean;
  /** Draw a soft gradient under the primary line. */
  fill?: boolean;
  /** Highlight the most recent point. */
  showEndPoint?: boolean;
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  /** Minimal x labels along the bottom. */
  xLabels?: { x: number; label: string }[];
  /** Minimal y labels on the right edge. */
  yLabels?: number[];
  onSelect?: (point: Point | null) => void;
};

const PAD_TOP = 14;
const PAD_BOTTOM = 8;

export function LineChart({
  data,
  secondary,
  markers,
  height = 180,
  band,
  yDomain,
  xDomain,
  interactive = true,
  fill = true,
  showEndPoint = true,
  formatX,
  formatY = (y) => String(Math.round(y)),
  xLabels,
  yLabels,
  onSelect,
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const lastHaptic = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const model = useMemo(() => {
    if (width === 0 || data.length === 0) return null;
    const maxPts = Math.max(24, Math.floor(width / 3));
    const primary = downsample(data, maxPts);
    const second = secondary?.length ? downsample(secondary, maxPts) : undefined;

    const allY = [
      ...primary.map((p) => p.y),
      ...(second?.map((p) => p.y) ?? []),
      ...(markers?.map((p) => p.y) ?? []),
      ...(band ? [band.low, band.high] : []),
    ];
    const [dataLo, dataHi] = extent(allY);
    const [yMin, yMax] = yDomain ?? [Math.max(0, dataLo - 15), dataHi + 15];
    const [xMin, xMax] = xDomain ?? extent(primary.map((p) => p.x));
    const innerH = height - PAD_TOP - PAD_BOTTOM;
    const sx = (x: number) => (xMax === xMin ? width / 2 : ((x - xMin) / (xMax - xMin)) * width);
    const sy = (y: number) => PAD_TOP + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

    const scaled = primary.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    const line = monotonePath(scaled);
    const area = scaled.length
      ? `${line}L${scaled[scaled.length - 1].x},${height}L${scaled[0].x},${height}Z`
      : '';
    return {
      primary,
      scaled,
      xs: scaled.map((p) => p.x),
      line,
      area,
      secondLine: second ? monotonePath(second.map((p) => ({ x: sx(p.x), y: sy(p.y) }))) : undefined,
      markers: (markers ?? [])
        .filter((p) => p.x >= xMin && p.x <= xMax)
        .map((p) => ({ x: sx(p.x), y: sy(Math.min(yMax, Math.max(yMin, p.y))), color: p.color ?? colors.text })),
      band: band ? { y1: sy(band.high), y2: sy(band.low) } : undefined,
      grid: [0.25, 0.5, 0.75].map((f) => PAD_TOP + innerH * f),
      yTicks: (yLabels ?? []).map((v) => ({ v, y: sy(v) })),
      xTicks: (xLabels ?? []).map((t) => ({ ...t, px: sx(t.x) })),
    };
  }, [width, data, secondary, markers, band, yDomain, xDomain, height, yLabels, xLabels]);

  const handleTouch = (e: GestureResponderEvent) => {
    if (!model || !interactive) return;
    const x = Math.max(0, Math.min(width, e.nativeEvent.locationX));
    const idx = nearestIndex(model.xs, x);
    if (idx !== selected) {
      const t = Date.now();
      if (t - lastHaptic.current > 45) {
        haptics.selection();
        lastHaptic.current = t;
      }
      setSelected(idx);
      onSelect?.(model.primary[idx]);
    }
  };
  const release = () => {
    setSelected(null);
    onSelect?.(null);
  };

  const sel = model && selected != null ? model.scaled[selected] : null;
  const selData = model && selected != null ? model.primary[selected] : null;
  const end = model?.scaled[model.scaled.length - 1];
  const tooltipLeft = sel ? Math.min(Math.max(sel.x - 48, 0), Math.max(0, width - 96)) : 0;

  return (
    <View>
      <View
        style={{ height }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => interactive}
        onMoveShouldSetResponder={() => interactive}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={release}
        onResponderTerminate={release}>
        {model ? (
          <View pointerEvents="none">
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {model.grid.map((y) => (
              <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={colors.chartGrid} strokeWidth={1} />
            ))}
            {model.band ? (
              <Rect x={0} width={width} y={model.band.y1} height={model.band.y2 - model.band.y1} fill={colors.rangeBand} />
            ) : null}
            {model.secondLine ? (
              <Path d={model.secondLine} stroke={colors.chartSecondary} strokeWidth={1.5} fill="none" strokeDasharray="4 5" />
            ) : null}
            {fill ? <Path d={model.area} fill="url(#fill)" /> : null}
            <Path
              d={model.line}
              stroke={colors.chartPrimary}
              strokeWidth={2.25}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={sel ? 0.55 : 1}
            />
            {model.markers.map((m, i) => (
              <Circle key={`m${i}`} cx={m.x} cy={m.y} r={5.5} fill={colors.background} stroke={m.color} strokeWidth={2.25} />
            ))}
            {sel ? (
              <>
                <Line x1={sel.x} x2={sel.x} y1={0} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                <Circle cx={sel.x} cy={sel.y} r={14} fill="rgba(255,255,255,0.12)" />
                <Circle cx={sel.x} cy={sel.y} r={6} fill={colors.text} stroke={colors.background} strokeWidth={2} />
              </>
            ) : showEndPoint && end ? (
              <>
                <Circle cx={end.x} cy={end.y} r={11} fill="rgba(255,255,255,0.12)" />
                <Circle cx={end.x} cy={end.y} r={5} fill={colors.text} stroke={colors.background} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
          </View>
        ) : null}
        {model?.yTicks.map((t) => (
          <Text key={t.v} variant="caption" color="muted" style={[styles.yTick, { top: t.y - 16 }]}>
            {formatY(t.v)}
          </Text>
        ))}
        {sel && selData ? (
          <View pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft }]}>
            <Text variant="bodyStrong" tabular>
              {formatY(selData.y)}
            </Text>
            {formatX ? (
              <Text variant="caption" color="secondary">
                {formatX(selData.x)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {model && model.xTicks.length ? (
        <View style={styles.xAxis}>
          {model.xTicks.map((t, i) => (
            <Text
              key={`${t.label}-${i}`}
              variant="caption"
              color="muted"
              style={[
                styles.xTick,
                i === 0 ? { left: 0 } : i === model.xTicks.length - 1 ? { right: 0 } : { left: t.px - 20, width: 40, textAlign: 'center' },
              ]}>
              {t.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: -6,
    width: 96,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.elevatedHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  yTick: { position: 'absolute', right: 0, pointerEvents: 'none' },
  xAxis: { height: 20, marginTop: spacing.sm },
  xTick: { position: 'absolute', top: 0 },
});
