'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { NotificationSettings } from './use-settings'

export type NotificationType = 'done' | 'failed' | 'input'

const TITLES: Record<NotificationType, string> = {
  done:  '✅ Task completed',
  failed: '❌ Task failed',
  input: '⌨️  Agent needs input',
}

const SOUNDS: Record<NotificationType, { freq: number[]; duration: number }> = {
  done:   { freq: [523, 659, 784], duration: 0.15 },  // C E G — pleasant chord arp
  failed: { freq: [440, 370],      duration: 0.2  },  // A F# — descending
  input:  { freq: [880, 880],      duration: 0.08 },  // double ping
}

const EVENT_SETTING: Record<NotificationType, keyof NotificationSettings> = {
  done:   'playOnDone',
  failed: 'playOnFailed',
  input:  'playOnInput',
}

// Fix #5: reuse a single AudioContext instead of creating one per beep.
// Chrome limits concurrent AudioContexts to 6; a per-call new() leaks them.
let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext()
  }
  return _audioCtx
}

function playBeep(type: NotificationType) {
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume()
    const { freq, duration } = SOUNDS[type]
    freq.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = f
      const start = ctx.currentTime + i * (duration + 0.05)
      gain.gain.setValueAtTime(0.18, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.start(start)
      osc.stop(start + duration + 0.01)
    })
  } catch {
    // AudioContext unavailable — silently ignore
  }
}

export function useNotifications(settings: NotificationSettings) {
  const permissionRef = useRef<NotificationPermission>('default')

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    permissionRef.current = Notification.permission
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { permissionRef.current = p })
    }
  }, [])

  const notify = useCallback((type: NotificationType, body: string) => {
    const eventKey = EVENT_SETTING[type]
    if (!settings.audioEnabled || !settings[eventKey]) return

    playBeep(type)

    if (typeof Notification === 'undefined') return
    if (permissionRef.current !== 'granted') return
    if (document.visibilityState === 'visible') return

    new Notification(TITLES[type], {
      body,
      icon: '/favicon.ico',
      tag: type,
    })
  }, [settings])

  return { notify }
}
