// Route "/history/:id" → stack screen on top of the tabs.
import { useLocalSearchParams } from 'expo-router';

import { HistoryDetailScreen } from '@/screens/HistoryDetailScreen';

export default function HistoryDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HistoryDetailScreen id={id} />;
}
