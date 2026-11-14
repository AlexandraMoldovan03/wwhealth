import type { ThemeColors } from '@/constants/theme';
import type { IconName, MedicalEventType } from '@/types';

/** Icon, label and colour for each medical history event type. */
export function getEventStyle(type: MedicalEventType, colors: ThemeColors): { icon: IconName; label: string; color: string } {
  switch (type) {
    case 'diagnosis':
      return { icon: 'clipboard-outline', label: 'Diagnosis', color: colors.warning };
    case 'treatment':
      return { icon: 'medkit-outline', label: 'Treatment', color: colors.primary };
    case 'allergy':
      return { icon: 'alert-circle-outline', label: 'Allergy', color: colors.danger };
    case 'document':
      return { icon: 'document-text-outline', label: 'Document', color: colors.info };
    case 'xray':
      return { icon: 'scan-outline', label: 'X-ray', color: colors.accent };
    case 'visit':
      return { icon: 'person-outline', label: 'Visit', color: colors.success };
    case 'lab':
      return { icon: 'flask-outline', label: 'Lab results', color: colors.success };
  }
}
