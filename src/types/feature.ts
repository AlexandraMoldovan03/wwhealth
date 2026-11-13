import type { Href } from 'expo-router';

import type { IconName } from './icons';

export type FeatureCategory = 'AI' | 'Vision' | 'Data' | 'Integration';

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  category: FeatureCategory;
  /** Optional screen to open when the card is pressed. */
  route?: Href;
  isAvailable: boolean;
}
