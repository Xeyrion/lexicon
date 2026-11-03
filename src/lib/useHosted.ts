import { useEffect, useState } from 'react'
import { detectBackend } from './storageRemote'

/**
 * True when the app runs without the local file service — a hosted copy (GitHub
 * Pages, PWA). Copy that says "saved to a file on this machine" is wrong there,
 * so the few places that describe storage ask this instead of assuming.
 */
export function useHosted(): boolean {
  const [hosted, setHosted] = useState(false)
  useEffect(() => {
    let alive = true
    void detectBackend().then((backend) => {
      if (alive) setHosted(backend === 'idb')
    })
    return () => {
      alive = false
    }
  }, [])
  return hosted
}
