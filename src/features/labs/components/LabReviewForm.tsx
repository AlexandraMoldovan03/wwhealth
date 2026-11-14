import { StyleSheet, View } from 'react-native';

import { AppInput, AppText } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { LabReviewEditor } from '@/features/documents/components/LabReviewEditor';
import type { LabValueEntry } from '@/types';
import { useTranslation } from 'react-i18next';

import { isValidIsoDate } from '../labUtils';

/** What still blocks saving: uncertain values not confirmed yet, or a malformed date. */
export function reviewBlockers(values: LabValueEntry[], date: string) {
  return {
    uncertain: values.filter((v) => v.needsReview).length,
    dateInvalid: date.trim() !== '' && !isValidIsoDate(date.trim()),
  };
}

interface LabReviewFormProps {
  values: LabValueEntry[];
  onChange: (values: LabValueEntry[]) => void;
  date: string;
  onDateChange: (date: string) => void;
}

/** Analysis date + every extracted value, editable; uncertain ones must be confirmed one by one. */
export function LabReviewForm({ values, onChange, date, onDateChange }: LabReviewFormProps) {
  const { t } = useTranslation();
  const { uncertain, dateInvalid } = reviewBlockers(values, date);
  return (
    <View style={styles.wrap}>
      <AppInput
        label={t('labs.dateLabel')}
        icon="calendar-outline"
        placeholder={t('labs.datePlaceholder')}
        value={date}
        onChangeText={onDateChange}
        onClear={() => onDateChange('')}
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={10}
        error={dateInvalid ? t('labs.dateInvalid') : undefined}
      />
      <AppText variant="caption" color="textMuted">
        {date.trim() ? t('labs.dateHint') : t('labs.dateMissing')}
      </AppText>
      {uncertain > 0 && (
        <AppText variant="caption" color="warning" accessibilityRole="alert">
          {t('labs.uncertainHint', { count: uncertain })}
        </AppText>
      )}
      <LabReviewEditor values={values} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
});
