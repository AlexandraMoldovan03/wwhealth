import type { Href } from 'expo-router';

import type { IconName } from './icons';

export type FeatureCategory = 'Patient' | 'Doctor' | 'AI';

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  category: FeatureCategory;
  /** Screen to open when the card is pressed. */
  route?: Href;
  isAvailable: boolean;
}
