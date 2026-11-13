import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppInput,
  AppText,
  DemoNotice,
  ErrorState,
  ImagePickerArea,
  ScreenContainer,
} from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { ExtractionView } from '@/features/documents/components/ExtractionView';
import { DOCUMENT_TYPES } from '@/features/documents/documentMeta';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import type { DocumentType } from '@/types';
import { toUploadFile } from '@/utils/files';

const TYPE_VALUES = DOCUMENT_TYPES.map((t) => t.value);
const typeLabel = (v: DocumentType) => DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;

/** Upload a photo of a medical document → POST /api/v1/documents/analyze (Gemini on backend). */
export function UploadDocumentScreen() {
  const [type, setType] = useState<DocumentType>('lab_result');
  const [title, setTitle] = useState('');
  const picker = useImagePicker();
  const submit = useSubmit(api.analyzeDocument);

  const analyze = () => {
    if (picker.imageUri) void submit.run(toUploadFile(picker.imageUri, 'document.jpg'), type, title.trim());
  };

  return (
    <ScreenContainer edges={['bottom']}>
      {USE_MOCKS && <DemoNotice message="DEMO — extraction is simulated. Gemini runs on the backend, never in the app." />}

      <View style={styles.field}>
        <AppText variant="label" color="textMuted">
          Document type
        </AppText>
        <CategoryFilter options={TYPE_VALUES} value={type} onChange={setType} getLabel={typeLabel} />
      </View>
      <AppInput label="Title (optional)" placeholder="e.g. Blood test March" value={title} onChangeText={setTitle} />

      <ImagePickerArea imageUri={picker.imageUri} onPress={picker.pickFromLibrary} title="Select a document photo" hint="PDF support: add expo-document-picker later" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppButton title="Gallery" icon="images-outline" variant="outline" fullWidth onPress={picker.pickFromLibrary} />
        </View>
        <View style={styles.flex}>
          <AppButton title="Camera" icon="camera-outline" variant="outline" fullWidth onPress={picker.takePhoto} />
        </View>
      </View>

      <AppButton title="Upload & analyze" icon="sparkles" fullWidth disabled={!picker.imageUri} loading={submit.isLoading} onPress={analyze} />

      {(picker.pickError || submit.error) && <ErrorState message={picker.pickError ?? submit.error ?? undefined} />}
      {submit.data?.document.extraction && (
        <>
          <ExtractionView extraction={submit.data.document.extraction} />
          <AppButton title="View all documents" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
