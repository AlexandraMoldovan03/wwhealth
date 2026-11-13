/** DEMO DATA — items shown on History. Mirrors what `GET /history` should return. */
import type { HistoryItem } from '@/types';
import { minutesAgo } from '@/utils/format';

export const HISTORY_ITEMS: HistoryItem[] = [
  {
    id: 'h1',
    title: 'Street scene',
    description: 'Detected cars, pedestrians and traffic lights.',
    date: minutesAgo(12),
    status: 'completed',
    icon: 'car-outline',
    details: { Model: 'demo-model-v0', Labels: 'Car, Person, Traffic light', Confidence: '91%', Duration: '1.2 s' },
  },
  {
    id: 'h2',
    title: 'Receipt scan',
    description: 'OCR on a supermarket receipt.',
    date: minutesAgo(140),
    status: 'processing',
    icon: 'receipt-outline',
    details: { Model: 'ocr-demo', Pages: '1', Status: 'Waiting for backend' },
  },
  {
    id: 'h3',
    title: 'Plant photo',
    description: 'Species classification of a houseplant.',
    date: minutesAgo(60 * 20),
    status: 'completed',
    icon: 'leaf-outline',
    details: { Model: 'demo-model-v0', Labels: 'Monstera, Pot', Confidence: '84%', Duration: '0.9 s' },
  },
  {
    id: 'h4',
    title: 'Blurry selfie',
    description: 'Image quality too low for analysis.',
    date: minutesAgo(60 * 50),
    status: 'failed',
    icon: 'person-outline',
    details: { Model: 'demo-model-v0', Error: 'Image too blurry', Duration: '0.3 s' },
  },
  {
    id: 'h5',
    title: 'Desk setup',
    description: 'Detected laptop, mug and notebook.',
    date: minutesAgo(60 * 24 * 4),
    status: 'completed',
    icon: 'laptop-outline',
    details: { Model: 'demo-model-v0', Labels: 'Laptop, Cup, Book', Confidence: '88%', Duration: '1.1 s' },
  },
];
