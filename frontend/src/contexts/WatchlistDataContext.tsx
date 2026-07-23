/**
 * WatchlistDataContext — 共享自选股数据 Context
 * WatchlistHubPage 通过 useWatchlistData 加载一次数据，
 * 然后通过此 Context 传递给两个 Tab 面板。
 */

import React, { createContext, useContext } from 'react';
import type { WatchlistDataState } from '../hooks/useWatchlistData';
import { EMPTY_WATCHLIST_DATA } from '../hooks/useWatchlistData';

const WatchlistDataContext = createContext<WatchlistDataState>(EMPTY_WATCHLIST_DATA);

export const WatchlistDataProvider: React.FC<{
  value: WatchlistDataState;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <WatchlistDataContext.Provider value={value}>
    {children}
  </WatchlistDataContext.Provider>
);

/** 获取共享的自选股数据（仅在 WatchlistDataProvider 内部有效） */
export function useSharedWatchlistData(): WatchlistDataState {
  return useContext(WatchlistDataContext);
}

export default WatchlistDataContext;
