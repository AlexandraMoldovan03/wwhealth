import { MedicalTerms } from '@/screens/patient/documents/MedicalTerms';
import { Stack, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, Badge, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { ALL_DOCUMENT_TYPES } from '@/screens/shared/components/documentMeta';
import { confirmAction } from '@/screens/patient/smart-care/AppointmentsScreen';
import { CareSheet } from '@/screens/patient/smart-care/components/CareSheet';
import { api } from '@/services/backend';
import type { DocumentType, ExtractedItem, ExtractedLab, FactKind, ImportPreview, SourceRef } from '@/types';
import { formatDate } from '@/utils/format';

import { importErrorMessage } from './importErrors';

const KIND_ORDER: FactKind[] = ['reason', 'diagnosis', 'allergy', 'medication', 'procedure', 'investigation', 'vaccination',
  'symptom', 'recommendation', 'follow_up'];
const CATEGORIES = ALL_DOCUMENT_TYPES.map((d) => d.value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Smart Import preview: nothing reaches the record before the patient checks and confirms it here. */
export function ImportPreviewScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const load = useCallback(() => api.getImport(id), [id]);
  const { data, isLoading, error, reload } = useAsync(load);

  if (isLoading && !data) return <ScreenContainer edges={['bottom']}><LoadingState count={3} /></ScreenContainer>;
  if (error || !data) return <ScreenContainer edges={['bottom']}><ErrorState message={error ?? t('documents.notFound')} onRetry={reload} /></ScreenContainer>;
  return <ImportForm key={`${data.id}:${data.status}:${data.history.length}`} preview={data} reload={reload} />;
}

function SourceLine({ source }: { source: SourceRef }) {
  const { t } = useTranslation();
  if (!source.excerpt) return null;
  return (
    <AppText variant="caption" color="textMuted" numberOfLines={3}>
      {`„${source.excerpt}”${source.page ? ` · ${t('smart.page', { page: source.page })}` : ''}${source.verified ? '' : ` · ${t('smart.unverifiedSource')}`}`}
    </AppText>
  );
}

function ImportForm({ preview, reload }: { preview: ImportPreview; reload: () => Promise<void> }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ex = preview.extraction;
  const [title, setTitle] = useState(ex.proposedTitle || preview.originalFilename || '');
  const [category, setCategory] = useState<DocumentType>(ex.category);
  const [eventDate, setEventDate] = useState(ex.eventDate ?? '');
  const [institution, setInstitution] = useState(ex.institution ?? '');
  const [items, setItems] = useState<ExtractedItem[]>(ex.items);
  const [labs, setLabs] = useState<ExtractedLab[]>(ex.labs);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [editing, setEditing] = useState<ExtractedItem | null>(null);
  const [busy, setBusy] = useState<'confirm' | 'reject' | 'reanalyze' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retryable = ['ai_timeout', 'ai_busy', 'ai_rate_limited', 'ai_error'].includes(preview.fallbackReason ?? '');
  const locked = preview.status === 'rejected';
  const needsIdentity = preview.identity.requiresConfirmation;
  const dateInvalid = !!eventDate.trim() && !ISO_DATE.test(eventDate.trim());
  const confirmLabel = t(preview.status === 'confirmed' ? 'smart.saveChanges' : 'smart.confirm');
  const canConfirm = !locked && !!title.trim() && !dateInvalid && (!needsIdentity || identityConfirmed);

  const setItem = (key: string, patch: Partial<ExtractedItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const setLab = (key: string, patch: Partial<ExtractedLab>) => setLabs((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const run = async (kind: 'confirm' | 'reject' | 'reanalyze', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(importErrorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };
  const confirm = () => run('confirm', async () => {
    const saved = await api.confirmImport(preview.id, {
      title: title.trim(), category, specialty: ex.specialty, eventDate: eventDate.trim() || null,
      institution: institution.trim() || null, items, labs, identityConfirmed,
    });
    if (saved.documentId) router.replace({ pathname: '/patient/document/[id]', params: { id: saved.documentId } });
  });
  const reject = () => confirmAction(t('smart.rejectTitle'), t('smart.rejectMessage'), t('smart.reject'), t('common.cancel'),
    () => void run('reject', async () => {
      await api.rejectImport(preview.id);
      router.replace('/patient/documents');
    }));
  const reanalyze = () => run('reanalyze', async () => {
    await api.reanalyzeImport(preview.id);
    await reload();
  });

  const identityColor = preview.identity.status === 'mismatch' ? colors.danger : preview.identity.status === 'match' ? colors.success : colors.warning;
  const groups = KIND_ORDER.map((k) => ({ kind: k, rows: items.filter((i) => i.kind === k) })).filter((g) => g.rows.length);

  return (
    <View style={styles.flex}>
    <ScreenContainer edges={[]}>
      <Stack.Screen options={{ title: t('smart.previewTitle') }} />
      <MedicalTerms terms={ex.nerTerms} />
      {error && <AppText accessibilityRole="alert" variant="caption" color="danger">{error}</AppText>}

      <View style={styles.badges}>
        <Badge label={t(`smart.method.${preview.method}`)} color={preview.method === 'gemini' ? colors.primary : colors.info} />
        <Badge label={t(`smart.format.${preview.sourceFormat}`)} color={colors.textMuted} />
        {preview.cached && <Badge label={t('smart.cached')} color={colors.success} />}
        {preview.isDemo && <Badge label={t('home.demoData')} color={colors.warning} />}
        {preview.status === 'confirmed' && <Badge label={t('smart.status.confirmed')} color={colors.success} />}
        {locked && <Badge label={t('smart.status.rejected')} color={colors.danger} />}
      </View>
      <AppText accessibilityLiveRegion="polite" variant="caption" color="textMuted">
        {t(busy === 'reanalyze' ? 'smart.analysisRunning' : retryable ? 'smart.analysisDeferred' : 'smart.reviewReady')}
      </AppText>
      {!!preview.fallbackReason && <AppText variant="caption" color="textMuted">{t(`smart.fallback.${preview.fallbackReason}`, { defaultValue: t('smart.fallback.ai_error') })}</AppText>}
      {!!preview.originalFilename && <AppText variant="caption" color="textMuted">{t('smart.originalFile', { name: preview.originalFilename })}</AppText>}

      {preview.identity.status !== 'match' && (
        <AppCard style={[styles.card, { borderColor: identityColor, borderWidth: 1 }]}>
          <AppText variant="subheading">{t(`smart.identity.${preview.identity.status}`)}</AppText>
          {(preview.identity.documentName || preview.identity.documentBirthDate) && (
            <AppText variant="caption">{[preview.identity.documentName, preview.identity.documentBirthDate && formatDate(preview.identity.documentBirthDate)].filter(Boolean).join(' · ')}</AppText>
          )}
          {preview.identity.reasons.map((r) => (
            <AppText key={r} variant="caption" color="textMuted">• {t(`smart.identityReason.${r}`, { defaultValue: r })}</AppText>
          ))}
          {needsIdentity && !locked && (
            <View style={styles.switchRow}>
              <AppText variant="body" style={styles.flex}>{t('smart.identityConfirm')}</AppText>
              <Switch accessibilityLabel={t('smart.identityConfirm')} value={identityConfirmed} onValueChange={setIdentityConfirmed} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
          )}
        </AppCard>
      )}

      <AppInput label={t('smart.titleLabel')} value={title} onChangeText={setTitle} maxLength={160} editable={!locked} />
      <View style={styles.field}>
        <AppText variant="label">{t('smart.category')}</AppText>
        <CategoryFilter options={CATEGORIES} value={category} onChange={setCategory} getLabel={(v) => t(`documentTypes.${v}`)} />
      </View>
      <AppInput label={t('smart.eventDate')} value={eventDate} onChangeText={setEventDate} placeholder="AAAA-LL-ZZ" maxLength={10}
        autoCapitalize="none" error={dateInvalid ? t('smart.dateInvalid') : undefined} editable={!locked} />
      <AppInput label={t('smart.institution')} value={institution} onChangeText={setInstitution} maxLength={160} editable={!locked} />
      {!!ex.specialty && <AppText variant="caption" color="textMuted">{t('smart.specialty', { name: ex.specialty })}</AppText>}

      {preview.duplicates.length > 0 && (
        <View style={styles.field}>
          <SectionHeader title={t('smart.duplicates')} />
          {preview.duplicates.map((d) => (
            <ListRow key={`${d.documentId}:${d.reason}`} icon="copy-outline" iconColor={colors.warning} title={d.title}
              subtitle={[t(`smart.duplicate.${d.reason}`), d.date && formatDate(d.date)].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/patient/document/[id]', params: { id: d.documentId } })} />
          ))}
        </View>
      )}

      {preview.contradictions.length > 0 && (
        <AppCard style={[styles.card, { borderColor: colors.warning, borderWidth: 1 }]}>
          <AppText variant="subheading">{t('smart.contradictions')}</AppText>
          {preview.contradictions.map((c, i) => (
            <AppText key={`${c.code}:${i}`} variant="caption">
              {`• ${c.label}: ${t(`smart.contradiction.${c.code}`, { defaultValue: c.code })}`}
            </AppText>
          ))}
        </AppCard>
      )}

      {ex.toVerify.length > 0 && (
        <AppCard tone="muted" style={styles.card}>
          <AppText variant="subheading">{t('smart.toVerify')}</AppText>
          {ex.toVerify.map((v) => <AppText key={v} variant="caption">• {t(`smart.verify.${v}`, { defaultValue: v })}</AppText>)}
        </AppCard>
      )}

      {groups.length === 0 && labs.length === 0 && <AppText variant="caption" color="textMuted">{t('smart.nothingExtracted')}</AppText>}
      {groups.map((g) => (
        <View key={g.kind} style={styles.field}>
          <SectionHeader title={`${t(`smart.kind.${g.kind}`)} · ${g.rows.length}`} />
          {g.kind === 'medication' && <AppText variant="caption" color="textMuted">{t('smart.medicationNote')}</AppText>}
          {g.rows.map((it) => (
            <AppCard key={it.key} style={[styles.card, !it.include && styles.excluded]}>
              <View style={styles.switchRow}>
                <AppText variant="subheading" style={styles.flex}>{it.label}</AppText>
                <Switch value={it.include} disabled={locked} onValueChange={(v) => setItem(it.key, { include: v })}
                  trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel={t('smart.include')} />
              </View>
              <View style={styles.badges}>
                {!!it.status && <Badge label={t(`smart.itemStatus.${it.status}`, { defaultValue: it.status })} color={it.status === 'confirmed' ? colors.success : colors.info} />}
                {it.uncertain && <Badge label={t('smart.uncertain')} color={colors.warning} />}
                {it.edited && <Badge label={t('smart.edited')} color={colors.textMuted} />}
              </View>
              {!!it.detail && <AppText variant="caption">{it.detail}</AppText>}
              {!!it.date && <AppText variant="caption" color="textMuted">{formatDate(it.date)}</AppText>}
              <SourceLine source={it.source} />
              {!locked && <AppButton title={t('common.edit')} variant="ghost" size="sm" icon="create-outline" onPress={() => setEditing(it)} />}
            </AppCard>
          ))}
        </View>
      ))}

      {labs.length > 0 && (
        <View style={styles.field}>
          <SectionHeader title={`${t('smart.labs')} · ${labs.length}`} />
          {labs.map((l) => (
            <AppCard key={l.key} style={[styles.card, !l.include && styles.excluded]}>
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <AppText variant="subheading">{l.name}</AppText>
                  <AppText variant="caption">{[`${l.value}${l.unit ? ` ${l.unit}` : ''}`, l.referenceRange && t('smart.reference', { range: l.referenceRange }), l.measuredAt && formatDate(l.measuredAt)].filter(Boolean).join(' · ')}</AppText>
                </View>
                <Switch value={l.include} disabled={locked} onValueChange={(v) => setLab(l.key, { include: v })} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
              {l.uncertain && <Badge label={t('smart.uncertain')} color={colors.warning} />}
              <SourceLine source={l.source} />
            </AppCard>
          ))}
        </View>
      )}

      {!locked && (
        <View style={styles.field}>
          <AppButton title={t(retryable ? 'smart.retryAnalysis' : 'smart.reanalyze')} icon="refresh-outline" variant="outline" fullWidth disabled={!!busy} loading={busy === 'reanalyze'} onPress={() => void reanalyze()} />
          <AppText variant="caption" color="textMuted">{t('smart.reanalyzeHint')}</AppText>
          <AppButton title={t('smart.reject')} icon="close-circle-outline" variant="ghost" fullWidth disabled={!!busy} loading={busy === 'reject'} onPress={reject} />
        </View>
      )}
      {locked && <AppButton title={t('smart.backToDocuments')} fullWidth onPress={() => router.replace('/patient/documents')} />}

      {editing && (
        <ItemEditor item={editing} onClose={() => setEditing(null)}
          onSave={(label, detail) => { setItem(editing.key, { label, detail, edited: true }); setEditing(null); }} />
      )}
    </ScreenContainer>
    {/* Always-visible save bar: the confirm action never hides at the end of a long preview. */}
    {!locked && (
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {needsIdentity && !identityConfirmed && (
          <View style={styles.switchRow}>
            <AppText variant="caption" style={styles.flex}>{t('smart.identityConfirm')}</AppText>
            <Switch accessibilityLabel={t('smart.identityConfirm')} value={identityConfirmed} onValueChange={setIdentityConfirmed}
              trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
        )}
        {(!title.trim() || dateInvalid) && <AppText variant="caption" color="danger">{t(!title.trim() ? 'smart.titleRequired' : 'smart.dateInvalid')}</AppText>}
        <AppButton title={confirmLabel} icon="checkmark-circle-outline" fullWidth
          disabled={!canConfirm || !!busy} loading={busy === 'confirm'} onPress={() => void confirm()} />
      </View>
    )}
    </View>
  );
}

function ItemEditor({ item, onClose, onSave }: { item: ExtractedItem; onClose: () => void; onSave: (label: string, detail: string | null) => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(item.label);
  const [detail, setDetail] = useState(item.detail ?? '');
  return (
    <CareSheet title={t('smart.editItem')} onClose={onClose}>
      <AppInput label={t('smart.itemLabel')} value={label} onChangeText={setLabel} maxLength={200} />
      <AppInput label={t('smart.itemDetail')} value={detail} onChangeText={setDetail} maxLength={500} multiline />
      <SourceLine source={item.source} />
      <AppButton title={t('common.save')} fullWidth disabled={!label.trim()} onPress={() => onSave(label.trim(), detail.trim() || null)} />
    </CareSheet>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: { gap: spacing.xs },
  excluded: { opacity: 0.5 },
  field: { gap: spacing.sm },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
