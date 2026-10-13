import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Hub, Snapshot } from './hub.js'

export const HubContext = createContext<Hub | null>(null)

export function useHub(): Hub {
  const hub = useContext(HubContext)
  if (!hub) throw new Error('hub missing')
  return hub
}

export function useSnapshot(): Snapshot {
  const hub = useHub()
  return useSyncExternalStore(hub.subscribe, hub.getSnapshot, hub.getSnapshot)
}
