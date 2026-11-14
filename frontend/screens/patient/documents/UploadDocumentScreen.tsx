import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, ErrorState, ImagePickerArea, ListRow, ScreenContainer } from '@/design-system';
import { USE_MOCKS } from '@/config/config';
import { spacing } from '@/design-system/theme';
import { DOCUMENT_TYPES } from '@/screens/shared/components/documentMeta';
import { useDocumentPicker } from './useDocumentPicker';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { DocumentType, LabValueEntry } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { LabReviewForm, reviewBlockers } from '@/screens/patient/lab-results/components/LabReviewForm';
import { prepareLabValues, scanMessage } from '@/screens/patient/lab-results/labUtils';
import { formatFileSize } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const TYPE_VALUES = DOCUMENT_TYPES.map((t) => t.value);

/** Upload a PDF or image → POST /api/v1/documents; optional local value extraction reviewed before saving. */
export function UploadDocumentScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [type, setType] = useState<DocumentType>('lab_result');
  const [title, setTitle] = useState('');
  const picker = useDocumentPicker();
  const submit = useSubmit(api.uploadDocument);
  const uploaded = submit.data?.document;

  // Document scanner: local text extraction for digital PDFs, reviewed by the user before saving.
  const [labs, setLabs] = useState<LabValueEntry[] | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [labDate, setLabDate] = useState('');
  const [labSaveError, setLabSaveError] = useState<string | null>(null);
  const [savedLabs, setSavedLabs] = useState(0);
  const pickedKey = picker.file?.uri;
  const [scannedFor, setScannedFor] = useState<string | undefined>(undefined);
  if (pickedKey !== scannedFor && (labs || scanInfo)) {
    // A different file was picked → previous scan no longer applies.
    setScannedFor(pickedKey);
    setLabs(null);
    setScanInfo(null);
    setLabDate('');
  }

  const scan = async () => {
    if (!picker.file) return;
    setScanning(true);
    setScanInfo(null);
    try {
      const res = await api.extractLabValues(picker.file);
      setScannedFor(picker.file.uri);
      setLabs(res.values);
      setLabDate(res.documentDate ?? '');
      setScanInfo(scanMessage(res, t));
    } catch (err) {
      setScanInfo(getErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const blockers = reviewBlockers(labs ?? [], labDate);

  const upload = async () => {
    if (!picker.file) return;
    const res = await submit.run(picker.file, type, title.trim());
    const confirmed = prepareLabValues(labs ?? [], labDate.trim() || null);
    if (res && confirmed.length) {
      try {
        const saved = await api.saveLabValues(res.document.id, confirmed);
        setSavedLabs(saved.length);
      } catch (err) {
        setLabSaveError(getErrorMessage(err)); // the document itself is uploaded
      }
    }
  };

  if (uploaded) {
    return (
      <ScreenContainer edges={['bottom']}>
        <AppCard style={styles.done}>
          <AppText variant="heading">{t('upload.done')}</AppText>
          <AppText color="textMuted">
            {t('upload.doneText', { title: uploaded.title })}
          </AppText>
          {savedLabs > 0 && <AppText color="primary">{t('scanner.saved', { count: savedLabs })}</AppText>}
        </AppCard>
        {labSaveError && <ErrorState title={t('scanner.saveFailed')} message={labSaveError} />}
        <AppButton
          title={t('upload.open')}
          icon="eye-outline"
          fullWidth
          onPress={() => router.replace({ pathname: '/patient/document/[id]', params: { id: uploaded.id } })}
        />
        <AppButton title={t('upload.back')} variant="ghost" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.field}>
        <AppText variant="label" color="textMuted">
          {t('upload.type')}
        </AppText>
        <CategoryFilter options={TYPE_VALUES} value={type} onChange={setType} getLabel={(v) => t(`documentTypes.${v}`)} />
      </View>
      <AppInput label={t('upload.titleLabel')} placeholder={t('upload.titlePlaceholder')} value={title} onChangeText={setTitle} maxLength={120} />

      {picker.file?.isPdf ? (
        <ListRow
          icon="document-text-outline"
          iconColor={colors.danger}
          title={picker.file.name}
          subtitle={`PDF${picker.file.size ? ` · ${formatFileSize(picker.file.size)}` : ''} · ${t('upload.tapToChange')}`}
          onPress={picker.pickFile}
        />
      ) : (
        <ImagePickerArea
          imageUri={picker.file?.uri ?? null}
          onPress={picker.pickFile}
          title={t('upload.select')}
          hint={t('upload.hint')}
        />
      )}

      <View style={styles.row}>
        <View style={styles.flex}>
          <AppButton size="sm" title={t('upload.files')} icon="document-attach-outline" variant="outline" fullWidth onPress={picker.pickFile} />
        </View>
        <View style={styles.flex}>
          <AppButton size="sm" title={t('upload.gallery')} icon="images-outline" variant="outline" fullWidth onPress={picker.pickPhoto} />
        </View>
        <View style={styles.flex}>
          <AppButton size="sm" title={t('upload.camera')} icon="camera-outline" variant="outline" fullWidth onPress={picker.takePhoto} />
        </View>
      </View>

      {picker.file ? (
        <AppCard style={styles.scanCard} tone="muted">
          <AppText variant="subheading">{t('scanner.title')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('scanner.intro')}
          </AppText>
          {!labs && (
            <AppButton title={t('scanner.scan')} icon="scan-outline" variant="secondary" size="sm" loading={scanning} onPress={() => void scan()} />
          )}
          {scanInfo && <AppText variant="caption" color="warning">{scanInfo}</AppText>}
          {labs && labs.length > 0 && (
            <>
              <AppText variant="caption" color="textMuted">
                {t('scanner.review', { count: labs.length })}
              </AppText>
              <LabReviewForm values={labs} onChange={setLabs} date={labDate} onDateChange={setLabDate} />
            </>
          )}
        </AppCard>
      ) : null}

      <AppButton
        title={labs && labs.length ? t('scanner.uploadWithValues', { count: labs.length }) : t('upload.upload')}
        icon="cloud-upload-outline"
        fullWidth
        disabled={!picker.file || (labs !== null && (blockers.uncertain > 0 || blockers.dateInvalid))}
        loading={submit.isLoading}
        onPress={() => void upload()}
      />

      {(picker.pickError || submit.error) && <ErrorState message={picker.pickError ?? submit.error ?? undefined} />}
      <DemoNotice
        message={
          USE_MOCKS
            ? t('upload.mockNotice')
            : t('upload.privacyNotice')
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  done: { gap: spacing.sm },
  scanCard: { gap: spacing.sm },
});
