import { Badge } from '@/design-system';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

import { labFlag } from '@/screens/patient/lab-results/labUtils';

/** "Above / below / within the printed range" — shown only when value and range are comparable numbers. */
export function LabFlagBadge({ value, range }: { value: string; range: string | null | undefined }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const flag = labFlag(value, range);
  if (!flag) return null;
  const color = flag === 'normal' ? colors.success : flag === 'high' ? colors.warning : colors.info;
  return <Badge label={t(`labs.flag.${flag}`)} color={color} />;
}
