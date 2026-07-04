import type { DailyMode } from '../dailyModes'
import type { ModeAdapter } from './types'
import { pyramidAdapter } from './pyramid'
import { triddleAdapter } from './triddle'
import { ruddleAdapter } from './ruddle'
import { speedleAdapter } from './speedle'

// Registry central : dispatch mode.kind → adapter.
// Un nouveau mode = un nouveau fichier `<mode>.tsx` + une entrée ici.
export function getAdapter(mode: DailyMode): ModeAdapter {
  switch (mode.kind) {
    case 'pyramid':  return pyramidAdapter  as ModeAdapter
    case 'triddle':  return triddleAdapter  as ModeAdapter
    case 'ruddle':   return ruddleAdapter   as ModeAdapter
    case 'speedle':  return speedleAdapter  as ModeAdapter
  }
}
