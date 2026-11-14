import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, EmptyState } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { DocumentPreview } from '@/screens/shared/components/DocumentPreview';
import { getDocumentMeta } from '@/screens/shared/components/documentMeta';
import { resolveApiUrl } from '@/services/api/client';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import { PatientGate } from './components/PatientGate';

/** One shared document (doctor view). The file endpoint re-checks the consent and logs the access. */
export function PatientDocumentScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { docId } = useLocalSearchParams<{ docId: string }>();

  return (
    <PatientGate scroll={false}>
      {(view) => {
        const doc = view.documents?.find((d) => d.id === docId);
        if (!doc) return <EmptyState icon="document-outline" title={t('documents.notFound')} message={t('consent.doctor.documentsNotShared')} />;
        return (
          <>
            <Stack.Screen options={{ title: doc.title }} />
            <View style={styles.header}>
              <AppText variant="heading" numberOfLines={2}>
                {doc.title}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {`${t(`documentTypes.${getDocumentMeta(doc.type).value}`)} · ${formatDateTime(doc.uploadedAt)}`}
              </AppText>
            </View>
            <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              {doc.fileUrl && doc.mimeType ? (
                <DocumentPreview uri={resolveApiUrl(doc.fileUrl)} mimeType={doc.mimeType} />
              ) : (
                <EmptyState icon="document-outline" title={t('documents.noFile')} />
              )}
            </View>
          </>
        );
      }}
    </PatientGate>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxs },
  preview: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
