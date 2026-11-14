import { useState } from 'react';

import { EmptyState, ScreenContainer, SectionHeader } from '@/design-system';
import { NoAccessState } from './components/NoAccessState';
import { useDoctorPatient } from './useDoctorPatient';
import { XrayList } from '@/screens/shared/components/XrayList';
import { XrayResultCard } from '@/screens/shared/components/XrayResultCard';
import { useTranslation } from 'react-i18next';

/** LungVision Results (doctor view). */
export function DoctorLungVisionScreen() {
  const { patient } = useDoctorPatient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { t } = useTranslation();

  if (!patient) return <ScreenContainer edges={['bottom']}><NoAccessState /></ScreenContainer>;
  const selected = patient.xrays.find((x) => x.id === selectedId) ?? patient.xrays[0];

  return (
    <ScreenContainer edges={['bottom']}>
      {selected ? (
        <XrayResultCard result={selected} />
      ) : (
        <EmptyState icon="scan-outline" title={t('doctor.noXrays')} message={t('doctor.noXraysHint')} />
      )}
      {patient.xrays.length > 1 && (
        <>
          <SectionHeader title={t('xray.all')} />
          <XrayList xrays={patient.xrays} onSelect={(x) => setSelectedId(x.id)} />
        </>
      )}
    </ScreenContainer>
  );
}
