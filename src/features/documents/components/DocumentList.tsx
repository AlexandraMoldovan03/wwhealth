import { View } from 'react-native';

import { Badge, EmptyState, ListRow } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { MedicalDocument } from '@/types';
import { formatDateTime } from '@/utils/format';

import { getDocumentMeta } from '../documentMeta';
import { ExtractionView } from './ExtractionView';
import { useTranslation } from 'react-i18next';

/** Documents (+ extraction when available). Used by patient and doctor screens; `onSelect` opens a document. */
export function DocumentList({ documents, onSelect }: { documents: MedicalDocument[]; onSelect?: (doc: MedicalDocument) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (documents.length === 0) {
    return <EmptyState icon="folder-open-outline" title={t('documents.empty')} message={t('documents.emptyHint')} />;
  }
  return (
    <View style={{ gap: spacing.md }}>
      {documents.map((doc) => {
        const meta = getDocumentMeta(doc.type);
        const format =
          doc.mimeType === 'application/pdf' ? t('documents.formatPdf') : doc.mimeType?.startsWith('image/') ? t('documents.formatImage') : null;
        const canOpen = !!onSelect && !!doc.fileUrl && !!doc.mimeType;
        return (
          <View key={doc.id} style={{ gap: spacing.sm }}>
            <ListRow
              icon={meta.icon}
              title={doc.title}
              subtitle={[t(`documentTypes.${meta.value}`), format, formatDateTime(doc.uploadedAt)].filter(Boolean).join(' · ')}
              right={doc.isDemo ? <Badge label="DEMO" color={colors.warning} /> : undefined}
              onPress={canOpen ? () => onSelect(doc) : undefined}
            />
            {doc.extraction && <ExtractionView extraction={doc.extraction} />}
          </View>
        );
      })}
    </View>
  );
}
