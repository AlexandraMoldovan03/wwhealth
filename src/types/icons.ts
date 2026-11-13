import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Any valid Ionicons name — gives autocomplete everywhere an icon is passed. */
export type IconName = ComponentProps<typeof Ionicons>['name'];
