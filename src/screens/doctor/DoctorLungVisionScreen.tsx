import { useState } from 'react';

import { EmptyState, ScreenContainer, SectionHeader } from '@/components/ui';
import { NoAccessState } from '@/features/doctor/components/NoAccessState';
import { useDoctorPatient } from '@/features/doctor/useDoctorPatient';
import { XrayList } from '@/features/lungvision/components/XrayList';
import { XrayResultCard } from '@/features/lungvision/components/XrayResultCard';

/** LungVision Results (doctor view). */
export function DoctorLungVisionScreen() {
  const { patient } = useDoctorPatient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!patient) return <ScreenContainer edges={['bottom']}><NoAccessState /></ScreenContainer>;
  const selected = patient.xrays.find((x) => x.id === selectedId) ?? patient.xrays[0];

  return (
    <ScreenContainer edges={['bottom']}>
      {selected ? (
        <XrayResultCard result={selected} />
      ) : (
        <EmptyState icon="scan-outline" title="No X-rays shared" message="The patient has no analyses or did not share them." />
      )}
      {patient.xrays.length > 1 && (
        <>
          <SectionHeader title="All analyses" />
          <XrayList xrays={patient.xrays} onSelect={(x) => setSelectedId(x.id)} />
        </>
      )}
    </ScreenContainer>
  );
}
