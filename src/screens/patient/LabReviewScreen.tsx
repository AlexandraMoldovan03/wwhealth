import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { LabReviewForm, reviewBlockers } from '@/features/labs/components/LabReviewForm';
import { prepareLabValues, scanMessage } from '@/features/labs/labUtils';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import type { LabValueEntry } from '@/types';
import { useTranslation } from 'react-i18next';

interface Loaded {
  values: LabValueEntry[];
  date: string;
  info: string | null;
  saved: boolean; // values come from the database (→ can be deleted)
}

/**
 * Review / correct / delete the lab values of one document.
 * `extract` → read the stored document again (PDF text or local OCR) instead of loading saved values.
 */
export function LabReviewScreen({ id, extract }: { id: string; extract: boolean }) {
  const { t } = useTranslation();
  const load = useCallback(async (): Promise<Loaded> => {
    if (extract) {
      const res = await api.extractLabValuesFromDocument(id);
      return { values: res.values, date: res.documentDate ?? '', info: scanMessage(res, t), saved: false };
    }
    const values = await api.getLabValues(id);
    return { values, date: values.find((v) => v.measuredAt)?.measuredAt ?? '', info: null, saved: values.length > 0 };
  }, [id, extract, t]);
  const { data, isLoading, error, reload } = useAsync(load);

  // Editable copy, initialised once from the loaded data.
  const [values, setValues] = useState<LabValueEntry[] | null>(null);
  const [date, setDate] = useState('');
  const [source, setSource] = useState<Loaded | null>(null);
  if (data && data !== source) {
    setSource(data);
    setValues(data.values);
    setDate(data.date);
  }

  const save = useSubmit(api.saveLabValues);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blockers = reviewBlockers(values ?? [], date);

  const onSave = async () => {
    const res = await save.run(id, prepareLabValues(values ?? [], date.trim() || null));
    if (res) router.back();
  };
  const onDelete = async () => {
    const res = await save.run(id, []);
    if (res) router.back();
  };

  if (isLoading && !values) {
    return (
      <ScreenContainer edges={['bottom']}>
        <LoadingState message={extract ? t('labs.reading') : undefined} />
      </ScreenContainer>
    );
  }
  if (error) {
    return (
      <ScreenContainer edges={['bottom']}>
        <ErrorState message={error} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <AppText color="textMuted">{t('scanner.intro')}</AppText>
      {data?.info && (
        <AppCard tone="muted">
          <AppText variant="caption" color="warning">
            {data.info}
          </AppText>
        </AppCard>
      )}

      {values && values.length > 0 ? (
        <LabReviewForm values={values} onChange={setValues} date={date} onDateChange={setDate} />
      ) : (
        <EmptyState icon="flask-outline" title={t('labs.noValuesTitle')} message={t('labs.noValuesText')} />
      )}

      {save.error && <ErrorState compact title={t('scanner.saveFailedShort')} message={save.error} />}

      {values && values.length > 0 && (
        <AppButton
          title={t('labs.saveConfirmed', { count: values.length })}
          icon="checkmark-circle-outline"
          fullWidth
          disabled={blockers.uncertain > 0 || blockers.dateInvalid}
          loading={save.isLoading && !confirmDelete}
          onPress={() => void onSave()}
        />
      )}

      {data?.saved &&
        (confirmDelete ? (
          <View style={styles.confirm}>
            <AppText variant="caption" color="textMuted" align="center">
              {t('labs.deleteConfirmText')}
            </AppText>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton title={t('common.cancel')} variant="outline" size="sm" fullWidth onPress={() => setConfirmDelete(false)} />
              </View>
              <View style={styles.flex}>
                <AppButton title={t('labs.deleteConfirm')} variant="danger" size="sm" fullWidth loading={save.isLoading} onPress={() => void onDelete()} />
              </View>
            </View>
          </View>
        ) : (
          <AppButton title={t('labs.deleteAll')} icon="trash-outline" variant="ghost" fullWidth onPress={() => setConfirmDelete(true)} />
        ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
