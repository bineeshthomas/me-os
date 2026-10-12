import { useCallback, useEffect, useState } from 'react'
import { api, type PrivacySettings } from './api'

// Optional outside services (weather, website icons). Both are off until switched on in Settings.
const CHANGED = 'privacy-changed'
export const notifyPrivacyChanged = () => window.dispatchEvent(new Event(CHANGED))

export function usePrivacy(): PrivacySettings | null {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null)
  const load = useCallback(() => api.settings().then((s) => setPrivacy(s.privacy)).catch(() => {}), [])
  useEffect(() => {
    load()
    window.addEventListener(CHANGED, load)
    return () => window.removeEventListener(CHANGED, load)
  }, [load])
  return privacy
}
