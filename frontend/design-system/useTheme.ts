import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from './ThemeContext';

/** Access theme colours anywhere: `const { colors } = useTheme();` */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
