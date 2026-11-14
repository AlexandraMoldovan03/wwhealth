import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/ui';
import { iconSize, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName, LungAnalysis } from '@/types';
import { useTranslation } from 'react-i18next';

/**
 * LungVision result for non-experts.
 * Wording rules: never "diagnosis", "healthy", "confidence" or percentages. The classification comes only
 * from the real model score vs. the threshold returned by the backend.
 */

type ImageView = 'original' | 'heatmap';

// Texts live in the locale files under lung.result.positive / lung.result.negative.
const ICONS = { positive: 'alert-circle' as IconName, negative: 'remove-circle' as IconName } as const;

export function LungResultCard({ result, imageUri }: { result: LungAnalysis; imageUri: string | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isPositive = result.score >= result.threshold;
  const kind = isPositive ? 'positive' : 'negative';
  // Positive = warning (orange). Negative = neutral grey — never green, it must not read as "healthy".
  const accent = isPositive ? colors.warning : colors.textMuted;

  return (
    <AppCard style={styles.card} padded={false}>
      {/* 1. Classification — first thing the user sees */}
      <View style={[styles.status, { backgroundColor: `${accent}1A`, borderBottomColor: `${accent}40` }]}>
        <View style={styles.statusTop}>
          <Ionicons name={ICONS[kind]} size={iconSize.lg} color={accent} />
          <AppText variant="label" style={{ color: accent }}>
            {t(`lung.result.${kind}.subtitle`)}
          </AppText>
        </View>
        <AppText variant="title" accessibilityRole="header">
          {t(`lung.result.${kind}.title`)}
        </AppText>
        <AppText color="textMuted">{t(`lung.result.${kind}.explanation`)}</AppText>
      </View>

      <View style={styles.body}>
        {/* 2. Score */}
        <ScoreSection score={result.score} threshold={result.threshold} />

        {/* 3. Original / heatmap */}
        <ImageSection imageUri={imageUri} heatmapBase64={result.heatmapPngBase64} />

        {/* Medical notice — compact but always visible */}
        <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="shield-checkmark-outline" size={iconSize.sm} color={colors.textMuted} />
          <AppText variant="caption" color="textMuted" style={styles.flex}>
            {t('lung.result.notice')}
          </AppText>
        </View>

        <TechnicalDetails result={result} />
      </View>
    </AppCard>
  );
}

function ScoreSection({ score, threshold }: { score: number; threshold: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  return (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <AppText variant="subheading">{t('lung.result.score')}</AppText>
        <AppText variant="subheading">
          {score.toFixed(3)}
          <AppText color="textMuted">{t('lung.result.threshold', { threshold })}</AppText>
        </AppText>
      </View>
      {/* Neutral scale with a threshold tick — not a severity meter. */}
      <View>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <View style={[styles.tick, { left: `${clamp(threshold) * 100}%`, backgroundColor: colors.textMuted }]} />
          <View
            style={[styles.dot, { left: `${clamp(score) * 100}%`, backgroundColor: colors.text, borderColor: colors.surface }]}
          />
        </View>
        <View style={styles.rowBetween}>
          <AppText variant="caption" color="textSubtle">
            0
          </AppText>
          <AppText variant="caption" color="textSubtle">
            1
          </AppText>
        </View>
      </View>
      <AppText variant="caption" color="textMuted">
        {t('lung.result.scoreNote', { threshold })}
      </AppText>
    </View>
  );
}

function ImageSection({ imageUri, heatmapBase64 }: { imageUri: string | null; heatmapBase64: string | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [view, setView] = useState<ImageView>(heatmapBase64 ? 'heatmap' : 'original');
  const source = view === 'original' ? imageUri : heatmapBase64 ? `data:image/png;base64,${heatmapBase64}` : null;

  return (
    <View style={styles.section}>
      <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="tablist">
        {(['original', 'heatmap'] as const).map((option) => {
          const active = option === view;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setView(option)}
              style={[styles.segmentItem, active && [styles.segmentActive, { backgroundColor: colors.surface }]]}
            >
              <AppText variant="subheading" color={active ? 'text' : 'textMuted'}>
                {option === 'original' ? t('lung.result.original') : t('lung.result.heatmap')}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.imageFrame}>
        {source ? (
          <Image
            source={{ uri: source }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityLabel={view === 'original' ? t('lung.result.a11yOriginal') : t('lung.result.a11yHeatmap')}
          />
        ) : (
          <AppText variant="caption" style={styles.imageFallback}>
            {view === 'heatmap' ? t('lung.result.noHeatmap') : t('lung.result.noOriginal')}
          </AppText>
        )}
      </View>

      {view === 'heatmap' ? (
        <View style={styles.legendBlock}>
          <View style={styles.legendRow}>
            <AppText variant="caption" color="textMuted">
              {t('lung.result.lessInfluence')}
            </AppText>
            <View style={styles.legendBar}>
              {['#1E3A8A', '#06B6D4', '#84CC16', '#FACC15', '#DC2626'].map((c) => (
                <View key={c} style={[styles.legendStop, { backgroundColor: c }]} />
              ))}
            </View>
            <AppText variant="caption" color="textMuted">
              {t('lung.result.moreInfluence')}
            </AppText>
          </View>
          <AppText variant="caption" color="textMuted">
            {t('lung.result.heatmapNote')}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="textMuted">
          {t('lung.result.originalNote')}
        </AppText>
      )}
    </View>
  );
}

function TechnicalDetails({ result }: { result: LungAnalysis }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    [t('lung.result.model'), result.modelVersion],
    [t('lung.result.rawScore'), String(result.score)],
    [t('lung.result.thresholdLabel'), String(result.threshold)],
    [t('lung.result.processingTime'), `${result.processingTimeMs} ms`],
    [t('lung.result.imageStorage'), t('lung.result.notStored')],
  ];
  return (
    <View style={[styles.details, { borderTopColor: colors.border }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.rowBetween}
        hitSlop={8}
      >
        <AppText variant="caption" color="textMuted">
          {t('lung.result.technical')}
        </AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.sm} color={colors.textMuted} />
      </Pressable>
      {open && (
        <View style={styles.detailsBody}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.rowBetween}>
              <AppText variant="caption" color="textSubtle">
                {label}
              </AppText>
              <AppText variant="caption" color="textMuted" style={styles.detailValue}>
                {value}
              </AppText>
            </View>
          ))}
          <AppText variant="caption" color="textSubtle">
            {result.disclaimer}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  flex: { flex: 1 },
  status: { padding: spacing.md, paddingVertical: spacing.lg, gap: spacing.sm, borderBottomWidth: 1 },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { padding: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  track: { height: 12, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', marginVertical: spacing.xs },
  tick: { position: 'absolute', width: 2, height: 20, marginLeft: -1, borderRadius: 1 },
  dot: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.md },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md - 2 },
  segmentActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  imageFrame: { aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  imageFallback: { color: '#FFFFFF', textAlign: 'center', paddingHorizontal: spacing.lg },
  legendBlock: { gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendBar: { flex: 1, height: 8, flexDirection: 'row', borderRadius: radius.pill, overflow: 'hidden' },
  legendStop: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.md },
  details: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.sm },
  detailsBody: { gap: spacing.xs },
  detailValue: { flexShrink: 1, textAlign: 'right' },
});
