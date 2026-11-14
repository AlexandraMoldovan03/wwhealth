import type { ReactNode } from 'react';

import { ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import type { PatientAccessView } from '@/types';

import { NoAccessState } from './NoAccessState';
import { useDoctorPatient } from '../useDoctorPatient';

/** Loading / error / no-consent states shared by the doctor's patient screens; renders children only with valid consent. */
export function PatientGate({ scroll = true, children }: { scroll?: boolean; children: (view: PatientAccessView) => ReactNode }) {
  const { view, isLoading, error, reload } = useDoctorPatient();

  if (isLoading && !view) return <ScreenContainer help="doctorPatient" edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error && !view) return <ScreenContainer help="doctorPatient" edges={['bottom']}><ErrorState message={error} onRetry={reload} /></ScreenContainer>;
  if (!view) return null;
  if (view.status !== 'ok') {
    return <ScreenContainer help="doctorPatient" edges={['bottom']}><NoAccessState status={view.status} patientName={view.patientName} /></ScreenContainer>;
  }
  return <ScreenContainer help="doctorPatient" edges={['bottom']} scroll={scroll}>{children(view)}</ScreenContainer>;
}
