'use client'

import { useState, useCallback, useEffect } from 'react'

export interface NotificationSettings {
  audioEnabled: boolean
  playOnDone: boolean
  playOnFailed: boolean
  playOnInput: boolean
}

const STORAGE_KEY = 'qb:notification-settings'

const DEFAULTS: NotificationSettings = {
  audioEnabled: true,
  playOnDone: true,
  playOnFailed: true,
  playOnInput: true,
}

function load(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  // Fix #7: initialize with DEFAULTS on both server and client to avoid SSR hydration mismatch.
  // Load from localStorage after mount.
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS)
  useEffect(() => { setSettings(load()) }, [])

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return { settings, update }
}
