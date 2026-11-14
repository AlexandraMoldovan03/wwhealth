import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { DocumentPreview } from '@/screens/shared/components/DocumentPreview';
import { LabValuesPanel } from './components/LabValuesPanel';
import { getDocumentMeta } from '@/screens/shared/components/documentMeta';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { resolveApiUrl } from '@/services/api/client';
import { api } from '@/services/backend';
import { formatDateTime, formatFileSize } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** View one uploaded document (PDF or image) of the logged-in patient. */
export function DocumentViewerScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);
  const doc = data?.documents.find((d) => d.id === id);

  if (isLoading) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error || !doc) {
    return <ScreenContainer edges={['bottom']}><ErrorState message={error ?? t('documents.notFound')} onRetry={reload} /></ScreenContainer>;
  }

  const meta = getDocumentMeta(doc.type);
  const details = [t(`documentTypes.${meta.value}`), formatDateTime(doc.uploadedAt), doc.sizeBytes ? formatFileSize(doc.sizeBytes) : null].filter(Boolean).join(' · ');

  return (
    <ScreenContainer edges={['bottom']} scroll={false}>
      <Stack.Screen options={{ title: doc.title }} />
      <View style={styles.header}>
        <AppText variant="heading" numberOfLines={2}>
          {doc.title}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {details}
        </AppText>
      </View>
      <LabValuesPanel documentId={doc.id} />
      <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
        {doc.fileUrl && doc.mimeType ? (
          <DocumentPreview uri={resolveApiUrl(doc.fileUrl)} mimeType={doc.mimeType} />
        ) : (
          <EmptyState icon="document-outline" title={t('documents.noFile')} message={t('documents.noFileHint')} />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxs },
  preview: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
