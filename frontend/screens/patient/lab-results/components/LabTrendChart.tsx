import { useState } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { fadeIn } from '@/design-system';
import { fonts } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { formatDate } from '@/utils/format';

import { parseReferenceRange, type LabSeries } from '@/screens/patient/lab-results/labUtils';

interface LabTrendChartProps {
  series: LabSeries;
  /** Sparkline: no axes / labels. */
  compact?: boolean;
  height?: number;
}

/**
 * Line chart of ONE analysis in ONE unit (a series never mixes units — see buildLabSeries).
 * Non-numeric values ("<5", "pozitiv") are left out of the line. The shaded band is the printed
 * reference range, drawn only when every point carries the same comparable range.
 */
export function LabTrendChart({ series, compact = false, height = compact ? 44 : 190 }: LabTrendChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const points = series.points.filter((p) => p.numeric !== null) as (LabSeries['points'][number] & { numeric: number })[];

  const ranges = points.map((p) => p.referenceRange?.trim() ?? '');
  const sharedRange = ranges.length > 0 && ranges.every((r) => r === ranges[0]) ? parseReferenceRange(ranges[0]) : null;

  const values = points.map((p) => p.numeric);
  const bounds = [...values, sharedRange?.low, sharedRange?.high].filter((n): n is number => n !== undefined);
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  if (min === max) {
    min -= Math.abs(min) * 0.1 || 1;
    max += Math.abs(max) * 0.1 || 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const left = compact ? 4 : 44;
  const right = compact ? 4 : 12;
  const top = compact ? 4 : 12;
  const bottom = compact ? 4 : 26;
  const plotW = Math.max(width - left - right, 1);
  const plotH = height - top - bottom;
  const x = (i: number) => left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * plotH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.numeric).toFixed(1)}`).join(' ');
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Number(n.toFixed(2)).toString());

  const a11y = points.map((p) => `${p.value}${series.unit ? ` ${series.unit}` : ''}, ${p.date ? formatDate(p.date) : ''}`).join('; ');

  return (
    <Animated.View
      entering={fadeIn()}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.wrap, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${series.name}: ${a11y}`}
    >
      {width > 0 && points.length > 0 && (
        <Svg width={width} height={height}>
          {sharedRange && (sharedRange.low !== undefined || sharedRange.high !== undefined) && (
            <Rect
              x={left}
              width={plotW}
              y={y(sharedRange.high ?? max)}
              height={Math.max(y(sharedRange.low ?? min) - y(sharedRange.high ?? max), 0)}
              fill={colors.success}
              opacity={0.1}
              rx={6}
            />
          )}
          {!compact &&
            [max - pad, min + pad].map((v) => (
              <G key={v}>
                <Line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke={colors.border} strokeDasharray="4 4" />
                <SvgText x={left - 6} y={y(v) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={fonts.body}>
                  {fmt(v)}
                </SvgText>
              </G>
            ))}
          {points.length > 1 && (
            <Path d={path} stroke={colors.primary} strokeWidth={compact ? 2 : 2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {points.map((p, i) => {
            const last = i === points.length - 1;
            if (compact && !last) return null;
            return (
              <Circle
                key={`${p.documentId}-${i}`}
                cx={x(i)}
                cy={y(p.numeric)}
                r={last ? (compact ? 3.5 : 5) : 3.5}
                fill={last ? colors.primary : colors.surface}
                stroke={colors.primary}
                strokeWidth={2}
              />
            );
          })}
          {!compact && points.length > 0 && (
            <>
              <SvgText x={x(0)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor={points.length === 1 ? 'middle' : 'start'} fontFamily={fonts.body}>
                {points[0].date ? formatDate(points[0].date) : ''}
              </SvgText>
              {points.length > 1 && (
                <SvgText x={x(points.length - 1)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={fonts.body}>
                  {points[points.length - 1].date ? formatDate(points[points.length - 1].date) : ''}
                </SvgText>
              )}
            </>
          )}
        </Svg>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
