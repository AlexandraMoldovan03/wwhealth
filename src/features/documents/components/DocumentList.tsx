import { View } from 'react-native';

import { Badge, EmptyState, ListRow } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { MedicalDocument } from '@/types';
import { formatDateTime } from '@/utils/format';

import { getDocumentMeta } from '../documentMeta';
import { ExtractionView } from './ExtractionView';

/** Documents with their Gemini extraction. Used by patient and doctor screens. */
export function DocumentList({ documents }: { documents: MedicalDocument[] }) {
  const { colors } = useTheme();
  if (documents.length === 0) {
    return <EmptyState icon="folder-open-outline" title="No documents" message="Uploaded documents appear here." />;
  }
  return (
    <View style={{ gap: spacing.md }}>
      {documents.map((doc) => {
        const meta = getDocumentMeta(doc.type);
        return (
          <View key={doc.id} style={{ gap: spacing.sm }}>
            <ListRow
              icon={meta.icon}
              title={doc.title}
              subtitle={`${meta.label} · ${formatDateTime(doc.uploadedAt)}`}
              right={doc.isDemo ? <Badge label="DEMO" color={colors.warning} /> : undefined}
            />
            {doc.extraction && <ExtractionView extraction={doc.extraction} />}
          </View>
        );
      })}
    </View>
  );
}
