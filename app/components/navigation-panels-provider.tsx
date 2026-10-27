'use client';

import {createContext,useContext} from 'react';

const NavigationPanels = createContext<unknown>(undefined);
export const useNavigationPanels = () => useContext(NavigationPanels);

export default function NavigationPanelsProvider({panels,children}:{panels:unknown;children:React.ReactNode}) {
  return <NavigationPanels value={panels}>{children}</NavigationPanels>;
}
