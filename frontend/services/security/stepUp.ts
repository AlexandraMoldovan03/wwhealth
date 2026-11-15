/** Server step-up (`X-WWHealth-Step-Up`) → where the app sends the user. Pure: unit-tested without React Native. */
export type StepUpKind = 'reauth';

export function parseStepUp(header: string | null | undefined): StepUpKind | null {
  return header === 'reauth' ? header : null;
}

export const stepUpRoute = (_kind: StepUpKind) => '/security/reauth';
