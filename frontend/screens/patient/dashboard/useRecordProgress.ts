import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { api } from '@/services/backend';
import type { IconName, PatientRecord } from '@/types';

import { isChecklistHidden, setChecklistHidden, subscribeProgressFlags, wasAiSummaryOpened } from './progressStorage';

export type ProgressStepId = 'profile' | 'history' | 'document' | 'lab' | 'ai';

export interface ProgressStep {
  id: ProgressStepId;
  done: boolean;
  icon: IconName;
  route: Href;
}

/**
 * Smart onboarding checklist — computed only from the patient's real record (never hard-coded):
 * profile basics (blood type — the field the app can edit), medical history, first document, first confirmed lab value, AI summary available or opened.
 * `ready` is false until every source answered (or failed), so nothing flashes as "to do" while loading.
 */
export function useRecordProgress(patient: PatientRecord | null) {
  const user = useCurrentUser();
  const userId = user?.id ?? 'local';
  const labs = useAsync(api.listLabValues, { refetchOnFocus: true });
  const ai = useAsync(api.getMyIntelligence, { refetchOnFocus: true });
  const [aiOpened, setAiOpened] = useState(false);
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      void Promise.all([isChecklistHidden(userId), wasAiSummaryOpened(userId)]).then(([h, seen]) => {
        if (!active) return;
        setHidden(h);
        setAiOpened(seen);
      });
    load();
    const unsubscribe = subscribeProgressFlags(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const hide = useCallback((value: boolean) => void setChecklistHidden(userId, value), [userId]);

  const p = patient;
  const steps: ProgressStep[] = [
    { id: 'profile', done: !!p?.bloodType, icon: 'person-outline', route: '/patient/edit-profile' },
    {
      id: 'history',
      done: !!p && p.allergies.length + p.diagnoses.length + p.treatments.length + (p.surgeries?.length ?? 0) > 0,
      icon: 'medkit-outline',
      route: '/patient/edit-profile',
    },
    { id: 'document', done: (p?.documents.length ?? 0) > 0, icon: 'cloud-upload-outline', route: '/patient/upload-document' },
    { id: 'lab', done: (labs.data?.length ?? 0) > 0, icon: 'flask-outline', route: '/patient/documents' },
    { id: 'ai', done: !!ai.data?.summary || aiOpened, icon: 'sparkles-outline', route: '/patient/intelligence' },
  ];
  const ready = !!p && !labs.isLoading && !ai.isLoading && hidden !== null;
  const doneCount = steps.filter((s) => s.done).length;

  return { steps, doneCount, total: steps.length, next: steps.find((s) => !s.done) ?? null, ready, hidden: hidden ?? true, hide, ai: ai.data };
}
