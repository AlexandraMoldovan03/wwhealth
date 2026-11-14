import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

import type { HelpTopic } from './helpRegistry';
import { HelpSheet } from './HelpSheet';

interface HelpContextValue {
  openHelp: (topic: HelpTopic) => void;
}

const HelpContext = createContext<HelpContextValue>({ openHelp: () => undefined });

/** One help bottom sheet for the whole app; any screen opens it with `useHelp().openHelp(topic)`. */
export function HelpProvider({ children }: PropsWithChildren) {
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const openHelp = useCallback((next: HelpTopic) => setTopic(next), []);
  const value = useMemo(() => ({ openHelp }), [openHelp]);
  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpSheet topic={topic} onClose={() => setTopic(null)} />
    </HelpContext.Provider>
  );
}

export const useHelp = () => useContext(HelpContext);
