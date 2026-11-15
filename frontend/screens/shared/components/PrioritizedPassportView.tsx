import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, Badge, SectionHeader } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { PassportItem, PassportItemKind, PassportSource, PrioritizedPassport } from '@/types';
import { formatDate } from '@/utils/format';

type OpenSource = (documentId: string) => void;

const CRITICAL_GROUPS: PassportItemKind[] = ['allergy', 'condition', 'medication', 'lab'];
const ESSENTIAL_GROUPS: PassportItemKind[] = ['blood_type', 'medication', 'condition', 'history', 'procedure'];

/**
 * Emergency Passport, prioritised by the backend's clinical rules:
 * P1 critical → P2 essential → P3 abnormal results; normal results only on demand (patient preview).
 * Confirmed vs "needs confirmation" and conflicting sources are always visible; no AI prose.
 */
export function PrioritizedPassportView({ passport, onOpenSource }: { passport: PrioritizedPassport; onOpenSource?: OpenSource }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [showNormal, setShowNormal] = useState(false);
  const allergies = passport.critical.filter((i) => i.kind === 'allergy');

  return (
    <View style={styles.wrap}>
      <Priority level={1} title={t('passport.p1')} tint={colors.danger}>
        {allergies.length === 0 && (
          <Group title={t('passport.groups.allergy')}>
            <AppText variant="subheading" color="warning">{t('passport.allergiesUnknown')}</AppText>
          </Group>
        )}
        {CRITICAL_GROUPS.map((kind) => (
          <ItemGroup key={kind} kind={kind} items={passport.critical.filter((i) => i.kind === kind)} onOpenSource={onOpenSource} />
        ))}
        {passport.critical.length === 0 && (
          <AppText variant="caption" color="textMuted">{t('passport.noCritical')}</AppText>
        )}
      </Priority>

      {passport.essential.length > 0 && (
        <Priority level={2} title={t('passport.p2')} tint={colors.primary}>
          {ESSENTIAL_GROUPS.map((kind) => (
            <ItemGroup key={kind} kind={kind} items={passport.essential.filter((i) => i.kind === kind)} onOpenSource={onOpenSource} />
          ))}
        </Priority>
      )}

      {(passport.investigations.length > 0 || passport.normalLabs.length > 0) && (
        <Priority level={3} title={t('passport.p3')} tint={colors.info}>
          <ItemGroup kind="lab" items={passport.investigations} onOpenSource={onOpenSource} />
          {passport.normalLabs.length > 0 && (
            <>
              <AppButton
                title={t(showNormal ? 'passport.hideNormal' : 'passport.showNormal', { count: passport.normalLabs.length })}
                variant="ghost"
                size="sm"
                onPress={() => setShowNormal((v) => !v)}
              />
              {showNormal && <ItemGroup kind="lab" items={passport.normalLabs} onOpenSource={onOpenSource} />}
            </>
          )}
        </Priority>
      )}
    </View>
  );
}

function Priority({ level, title, tint, children }: { level: number; title: string; tint: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.priorityHead}>
        <View style={[styles.level, { backgroundColor: tint }]}>
          <AppText variant="label" style={styles.levelText}>{`P${level}`}</AppText>
        </View>
        <View style={styles.flex}>
          <SectionHeader title={title} />
        </View>
      </View>
      {children}
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AppCard style={styles.group}>
      <AppText variant="label" color="textMuted">{title}</AppText>
      {children}
    </AppCard>
  );
}

function ItemGroup({ kind, items, onOpenSource }: { kind: PassportItemKind; items: PassportItem[]; onOpenSource?: OpenSource }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <Group title={t(`passport.groups.${kind}`)}>
      {items.map((item) => <ItemRow key={item.key} item={item} onOpenSource={onOpenSource} />)}
    </Group>
  );
}

/** Exported for the document summary (same row, same badges). */
export function ItemRow({ item, onOpenSource }: { item: PassportItem; onOpenSource?: OpenSource }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;
  const lab = item.lab;
  const labColor = lab?.critical ? colors.danger : lab?.status === 'low' || lab?.status === 'high' ? colors.warning : colors.textMuted;
  const flags = item.flags.filter((f) => f !== 'abnormal_lab' && f !== 'critical_lab');

  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <AppText variant={item.kind === 'blood_type' ? 'display' : 'subheading'} color={item.kind === 'blood_type' ? 'danger' : 'text'} style={styles.flex}>
          {item.label}
        </AppText>
        {lab && (
          <View style={styles.labValue}>
            <AppText variant="subheading" style={{ color: labColor }}>
              {`${lab.value}${lab.unit ? ` ${lab.unit}` : ''}`}
              {lab.status === 'high' ? ' ↑' : lab.status === 'low' ? ' ↓' : ''}
            </AppText>
            {!!lab.referenceRange && (
              <AppText variant="caption" color="textMuted">{t('passport.reference', { range: lab.referenceRange })}</AppText>
            )}
          </View>
        )}
      </View>
      {!!item.detail && <AppText color="textMuted">{item.detail}</AppText>}
      {lab && lab.previous.length > 0 && (
        <AppText variant="caption" color="textMuted">
          {t('passport.previous', { values: lab.previous.map((p) => (p.date ? `${p.value} (${formatDate(p.date)})` : p.value)).join(' · ') })}
        </AppText>
      )}
      <View style={styles.badges}>
        {lab?.critical && <Badge label={t('passport.criticalValue')} color={colors.danger} />}
        {item.severity && <Badge label={t(`enums.severity.${item.severity}`, { defaultValue: item.severity })} color={severityColor[item.severity]} />}
        {flags.map((f) => <Badge key={f} label={t(`passport.flags.${f}`, { defaultValue: f })} color={f === 'suspected' ? colors.warning : colors.textMuted} />)}
        {!item.confirmed && <Badge label={t('passport.needsConfirmation')} color={colors.warning} />}
        {item.conflict && <Badge label={t('passport.conflict')} color={colors.danger} />}
      </View>
      {item.conflict && item.conflictValues.length > 0 && (
        <AppText variant="caption" color="danger">{t('passport.conflictValues', { values: item.conflictValues.join(' / ') })}</AppText>
      )}
      <Sources sources={item.sources} onOpenSource={onOpenSource} />
    </View>
  );
}

function Sources({ sources, onOpenSource }: { sources: PassportSource[]; onOpenSource?: OpenSource }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (sources.length === 0) return null;
  return (
    <View style={styles.sources}>
      {sources.map((s, i) => {
        const label = s.kind === 'profile'
          ? t('passport.sourceProfile')
          : [s.documentTitle || t('passport.sourceDocument'), s.date ? formatDate(s.date) : null, s.page ? t('passport.page', { page: s.page }) : null]
              .filter(Boolean).join(' · ');
        const open = onOpenSource && s.documentId ? () => onOpenSource(s.documentId as string) : undefined;
        return (
          <Pressable key={`${s.kind}-${s.documentId ?? 'p'}-${i}`} onPress={open} disabled={!open} accessibilityRole={open ? 'link' : 'text'} style={styles.source}>
            <Ionicons name={s.kind === 'profile' ? 'person-outline' : 'document-text-outline'} size={12} color={open ? colors.primary : colors.textSubtle} />
            <AppText variant="caption" style={{ color: open ? colors.primary : colors.textSubtle }} numberOfLines={1}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  section: { gap: spacing.sm },
  priorityHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  level: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  levelText: { color: '#FFFFFF' },
  group: { gap: spacing.md },
  item: { gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  labValue: { alignItems: 'flex-end' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sources: { gap: 2 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
