import { MedicalTerms } from './MedicalTerms';
import { Stack, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppInput, AppText, Badge, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { CareSheet } from '@/screens/patient/smart-care/components/CareSheet';
import { importErrorMessage } from '@/screens/patient/smart-import/importErrors';
import { DocumentPreview } from '@/screens/shared/components/DocumentPreview';
import { getDocumentMeta } from '@/screens/shared/components/documentMeta';
import { ApiError } from '@/services/api/ApiError';
import { getAuthHeaders, resolveApiUrl } from '@/services/api/client';
import { api } from '@/services/backend';
import type { DocumentDetail } from '@/types';
import { formatDate, formatDateTime, formatFileSize } from '@/utils/format';

import { LabValuesPanel } from './components/LabValuesPanel';

/** View one document of the logged-in patient: preview, editable title, extracted data with sources, links to the record. */
export function DocumentViewerScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const load = useCallback(async (): Promise<DocumentDetail> => {
    try {
      return await api.getLibraryDocument(id);
    } catch (err) {
      // Library not set up yet (migration not applied) → plain document from the patient record.
      if (!(err instanceof ApiError) || (err.status !== 503 && err.status !== 404)) throw err;
      const document = (await api.getMyPatient()).documents.find((d) => d.id === id);
      if (!document) throw err;
      return { document, facts: [], importId: null };
    }
  }, [id]);
  const { data, isLoading, error, reload } = useAsync(load, { refetchOnFocus: true });

  if (isLoading && !data) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error || !data) {
    return <ScreenContainer edges={['bottom']}><ErrorState message={error ?? t('documents.notFound')} onRetry={reload} /></ScreenContainer>;
  }
  return <DocumentView key={`${data.document.id}:${data.document.title}:${data.document.processingStatus ?? ''}`} initial={data} />;
}

async function downloadOnWeb(url: string, filename: string) {
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const blob = URL.createObjectURL(await res.blob());
  const a = globalThis.document.createElement('a');
  a.href = blob;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blob), 1000);
}

function DocumentView({ initial }: { initial: DocumentDetail }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [detail, setDetail] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const doc = detail.document;

  const meta = getDocumentMeta(doc.type);
  const details = [t(`documentTypes.${meta.value}`), doc.eventDate ? formatDate(doc.eventDate) : formatDateTime(doc.uploadedAt),
    doc.institution, doc.sizeBytes ? formatFileSize(doc.sizeBytes) : null].filter(Boolean).join(' · ');
  const previewable = !!doc.fileUrl && !!doc.mimeType && (doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/'));
  const needsReview = !!detail.importId && doc.processingStatus !== 'confirmed';
  const download = () => {
    setDownloadError(null);
    downloadOnWeb(resolveApiUrl(doc.fileUrl as string), doc.originalFilename || doc.title).catch(() => setDownloadError(t('documents.loadFailed')));
  };

  return (
    <ScreenContainer edges={['bottom']} scroll={false}>
      <Stack.Screen options={{ title: doc.title }} />
      <View style={styles.header}>
        <View style={styles.row}>
          <AppText variant="heading" numberOfLines={2} style={styles.flex}>{doc.title}</AppText>
          {!!doc.processingStatus && (
            <AppButton title={t('common.edit')} icon="create-outline" variant="ghost" size="sm" onPress={() => setEditing(true)} />
          )}
        </View>
        <AppText variant="caption" color="textMuted">{details}</AppText>
        {!!doc.originalFilename && doc.originalFilename !== doc.title && (
          <AppText variant="caption" color="textMuted">{t('smart.originalFile', { name: doc.originalFilename })}</AppText>
        )}
        <View style={styles.badges}>
          {doc.isDemo && <Badge label="DEMO" color={colors.warning} />}
          {!!doc.processingStatus && (
            <Badge label={t(`smart.status.${doc.processingStatus}`)} color={doc.processingStatus === 'confirmed' ? colors.success : colors.warning} />
          )}
        </View>
      </View>

      {needsReview && (
        <AppButton title={t('smart.reviewAndConfirm')} icon="checkmark-done-outline" fullWidth
          onPress={() => router.push({ pathname: '/patient/import/[id]', params: { id: detail.importId as string } })} />
      )}
      <View style={styles.row}>
        {detail.facts.length > 0 && (
          <AppButton title={t(showFacts ? 'smart.hideFacts' : 'smart.showFacts', { count: detail.facts.length })} variant="outline" size="sm"
            icon={showFacts ? 'chevron-up-outline' : 'chevron-down-outline'} onPress={() => setShowFacts((v) => !v)} />
        )}
        {doc.processingStatus === 'confirmed' && (
          <AppButton title={t('smart.openInRecord')} variant="ghost" size="sm" icon="folder-open-outline" onPress={() => router.push('/patient/record')} />
        )}
        {Platform.OS === 'web' && !!doc.fileUrl && (
          <AppButton title={t('smart.downloadOriginal')} variant="ghost" size="sm" icon="download-outline" onPress={download} />
        )}
      </View>
      {downloadError && <AppText variant="caption" color="danger">{downloadError}</AppText>}
      {showFacts && (
        <ScrollView style={[styles.facts, { borderColor: colors.border }]} contentContainerStyle={styles.factsContent} nestedScrollEnabled>
          {detail.facts.map((f) => (
            <View key={f.id} style={styles.fact}>
              <AppText variant="body">{`${t(`smart.kind.${f.kind}`)}: ${f.label}`}</AppText>
              {(!!f.status || !!f.detail) && (
                <AppText variant="caption">
                  {[f.status && t(`smart.itemStatus.${f.status}`, { defaultValue: f.status }), f.detail].filter(Boolean).join(' · ')}
                </AppText>
              )}
              {!!f.sourceExcerpt && (
                <AppText variant="caption" color="textMuted" numberOfLines={2}>
                  {`„${f.sourceExcerpt}”${f.sourcePage ? ` · ${t('smart.page', { page: f.sourcePage })}` : ''}`}
                </AppText>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <MedicalTerms terms={detail.nerTerms} />
      <LabValuesPanel documentId={doc.id} />
      <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
        {previewable ? (
          <DocumentPreview uri={resolveApiUrl(doc.fileUrl as string)} mimeType={doc.mimeType as string} />
        ) : doc.fileUrl ? (
          <EmptyState icon="code-slash-outline" title={t('smart.structuredPreview')} message={t('smart.structuredPreviewHint')} />
        ) : (
          <EmptyState icon="document-outline" title={t('documents.noFile')} message={t('documents.noFileHint')} />
        )}
      </View>

      {editing && <TitleEditor detail={detail} onClose={() => setEditing(false)} onSaved={(d) => { setDetail(d); setEditing(false); }} />}
    </ScreenContainer>
  );
}

function TitleEditor({ detail, onClose, onSaved }: { detail: DocumentDetail; onClose: () => void; onSaved: (d: DocumentDetail) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(detail.document.title);
  const [institution, setInstitution] = useState(detail.document.institution ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.updateLibraryDocument(detail.document.id, { title: title.trim(), institution: institution.trim() || null }));
    } catch (err) {
      setError(importErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <CareSheet title={t('smart.editDocument')} onClose={onClose}>
      <AppInput label={t('smart.titleLabel')} value={title} onChangeText={setTitle} maxLength={160} />
      <AppInput label={t('smart.institution')} value={institution} onChangeText={setInstitution} maxLength={160} />
      {error && <AppText variant="caption" color="danger">{error}</AppText>}
      <AppButton title={t('common.save')} fullWidth disabled={!title.trim()} loading={busy} onPress={() => void save()} />
    </CareSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  facts: { maxHeight: 220, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  factsContent: { padding: spacing.sm, gap: spacing.sm },
  fact: { gap: 2 },
  preview: { flex: 1, minHeight: 240, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
