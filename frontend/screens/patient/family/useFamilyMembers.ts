import { useCallback, useEffect, useState } from 'react';

import type { FamilyMember } from '@/types';

import {
  MAX_FAMILY_MEMBERS,
  createFamilyMemberId,
  createFamilyQr,
  loadFamilyMembers,
  saveFamilyMembers,
} from './familyStorage';

interface FamilyState {
  /** Account the loaded list belongs to; `null` until the first read finishes. */
  ownerId: string | null;
  members: FamilyMember[];
}

/**
 * Family members of the signed-in patient, saved on this device.
 * Keeping the owner inside the state makes sure a slow read for one account never shows
 * (or saves) another account's list.
 */
export function useFamilyMembers(userId: string | undefined) {
  const [state, setState] = useState<FamilyState>({ ownerId: null, members: [] });

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    void loadFamilyMembers(userId).then((loaded) => {
      if (mounted) setState({ ownerId: userId, members: loaded });
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Persist after the initial read, so opening the page never wipes the saved list.
  useEffect(() => {
    if (!userId || state.ownerId !== userId) return;
    void saveFamilyMembers(userId, state.members);
  }, [state, userId]);

  const update = useCallback(
    (change: (members: FamilyMember[]) => FamilyMember[]) => {
      setState((current) =>
        current.ownerId === userId ? { ...current, members: change(current.members) } : current,
      );
    },
    [userId],
  );

  const addMember = useCallback(
    (name: string, relationship: string) => {
      const member: FamilyMember = {
        id: createFamilyMemberId(),
        name: name.trim(),
        relationship: relationship.trim(),
        qr: null,
      };
      update((current) => [...current, member].slice(0, MAX_FAMILY_MEMBERS));
    },
    [update],
  );

  const removeMember = useCallback(
    (memberId: string) => {
      update((current) => current.filter((member) => member.id !== memberId));
    },
    [update],
  );

  /** Always replaces the previous code with a fresh 5-minute one. */
  const generateQr = useCallback(
    (memberId: string) => {
      update((current) =>
        current.map((member) => (member.id === memberId ? { ...member, qr: createFamilyQr(member.id) } : member)),
      );
    },
    [update],
  );

  /** Drops an expired code; called by the card when the countdown reaches zero. */
  const clearQr = useCallback(
    (memberId: string) => {
      update((current) =>
        current.map((member) => (member.id === memberId && member.qr ? { ...member, qr: null } : member)),
      );
    },
    [update],
  );

  const members = state.ownerId === userId ? state.members : [];

  return {
    members,
    loading: !userId || state.ownerId !== userId,
    canAdd: members.length < MAX_FAMILY_MEMBERS,
    addMember,
    removeMember,
    generateQr,
    clearQr,
  };
}
