import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { getPublicAlerts, type Village } from '@/services/api';
import { usePublicData } from './usePublicData';

function useVillageFeed() {
  const [area, setArea] = useState<Village | null>(null);
  const fetchAlerts = useCallback((signal: AbortSignal) => getPublicAlerts(signal, area?.code), [area?.code]);
  const alerts = usePublicData(fetchAlerts, true, 10000);
  return { area, setArea, alerts };
}

const Feed = createContext<ReturnType<typeof useVillageFeed> | null>(null);

export function AdvisoryProvider({ children }: { children: ReactNode }) {
  const feed = useVillageFeed();
  return <Feed.Provider value={feed}>{children}</Feed.Provider>;
}

export function useAdvisories() {
  const feed = useContext(Feed);
  if (!feed) throw new Error('Advisories require the tab layout.');
  return feed;
}
