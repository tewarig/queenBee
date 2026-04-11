import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNotifications } from './use-notifications'
import type { NotificationSettings } from './use-settings'

const defaultSettings: NotificationSettings = {
  audioEnabled: true,
  playOnDone: true,
  playOnFailed: true,
  playOnInput: true,
}

// ── AudioContext mock ──────────────────────────────────────────────────────────

let mockCreateOscillator: ReturnType<typeof vi.fn>
let mockCreateGain: ReturnType<typeof vi.fn>
let lastCtx: any = null  // track singleton so we can force re-creation between tests

function setupAudioMock() {
  // Mark the previous singleton as closed so getAudioCtx() creates a fresh one
  if (lastCtx) lastCtx.state = 'closed'

  const osc = {
    connect: vi.fn(), type: '' as OscillatorType,
    frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(),
  }
  const gain = {
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  }
  mockCreateOscillator = vi.fn(() => osc)
  mockCreateGain = vi.fn(() => gain)

  const ctx = {
    createOscillator: mockCreateOscillator,
    createGain: mockCreateGain,
    get destination() { return {} },
    get currentTime() { return 0 },
    state: 'running' as AudioContextState,
    resume: vi.fn(),
    close: vi.fn(),
  }
  lastCtx = ctx
  ;(global as any).AudioContext = vi.fn(() => ctx)
  return ctx
}

// ── Notification mock ──────────────────────────────────────────────────────────

function setupNotificationMock(permission: NotificationPermission = 'granted') {
  const instances: { title: string; options?: NotificationOptions }[] = []
  const NotifMock = vi.fn((title: string, options?: NotificationOptions) => {
    instances.push({ title, options })
  }) as any
  NotifMock.permission = permission
  NotifMock.requestPermission = vi.fn().mockResolvedValue(permission)
  Object.defineProperty(global, 'Notification', { value: NotifMock, configurable: true, writable: true })
  return instances
}

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset AudioContext singleton between tests by wiping module-level state
    ;(global as any).AudioContext = undefined
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    setupNotificationMock('granted')
  })

  describe('notify() — audio gating', () => {
    it('plays a beep when audioEnabled and event toggle are both true', () => {
      setupAudioMock()
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('done', 'finished'))
      expect(mockCreateOscillator).toHaveBeenCalled()
    })

    it('does not play when audioEnabled is false', () => {
      setupAudioMock()
      const settings = { ...defaultSettings, audioEnabled: false }
      const { result } = renderHook(() => useNotifications(settings))
      act(() => result.current.notify('done', 'finished'))
      expect(mockCreateOscillator).not.toHaveBeenCalled()
    })

    it('does not play when the specific event toggle is false (done)', () => {
      setupAudioMock()
      const settings = { ...defaultSettings, playOnDone: false }
      const { result } = renderHook(() => useNotifications(settings))
      act(() => result.current.notify('done', 'finished'))
      expect(mockCreateOscillator).not.toHaveBeenCalled()
    })

    it('plays for "failed" when playOnFailed is true', () => {
      setupAudioMock()
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('failed', 'error'))
      expect(mockCreateOscillator).toHaveBeenCalled()
    })

    it('does not play for "failed" when playOnFailed is false', () => {
      setupAudioMock()
      const settings = { ...defaultSettings, playOnFailed: false }
      const { result } = renderHook(() => useNotifications(settings))
      act(() => result.current.notify('failed', 'error'))
      expect(mockCreateOscillator).not.toHaveBeenCalled()
    })

    it('plays for "input" when playOnInput is true', () => {
      setupAudioMock()
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('input', 'question?'))
      expect(mockCreateOscillator).toHaveBeenCalled()
    })

    it('does not play for "input" when playOnInput is false', () => {
      setupAudioMock()
      const settings = { ...defaultSettings, playOnInput: false }
      const { result } = renderHook(() => useNotifications(settings))
      act(() => result.current.notify('input', 'question?'))
      expect(mockCreateOscillator).not.toHaveBeenCalled()
    })

    it('does not throw when AudioContext is unavailable', () => {
      ;(global as any).AudioContext = undefined
      const { result } = renderHook(() => useNotifications(defaultSettings))
      expect(() => act(() => result.current.notify('done', 'ok'))).not.toThrow()
    })
  })

  describe('notify() — system notification gating', () => {
    it('fires a system notification when permission granted and page hidden', () => {
      setupAudioMock()
      const instances = setupNotificationMock('granted')
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('done', 'Task finished'))
      expect(instances).toHaveLength(1)
      expect(instances[0].title).toBe('✅ Task completed')
      expect(instances[0].options?.body).toBe('Task finished')
    })

    it('does not fire system notification when page is visible', () => {
      setupAudioMock()
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      const instances = setupNotificationMock('granted')
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('done', 'Task finished'))
      expect(instances).toHaveLength(0)
    })

    it('does not fire system notification when permission is denied', () => {
      setupAudioMock()
      const instances = setupNotificationMock('denied')
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('done', 'Task finished'))
      expect(instances).toHaveLength(0)
    })

    it('does not fire system notification when audio is disabled', () => {
      setupAudioMock()
      const instances = setupNotificationMock('granted')
      const settings = { ...defaultSettings, audioEnabled: false }
      const { result } = renderHook(() => useNotifications(settings))
      act(() => result.current.notify('done', 'Task finished'))
      expect(instances).toHaveLength(0)
    })

    it('uses correct title for "failed" type', () => {
      setupAudioMock()
      const instances = setupNotificationMock('granted')
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('failed', 'something broke'))
      expect(instances[0].title).toBe('❌ Task failed')
    })

    it('uses correct title for "input" type', () => {
      setupAudioMock()
      const instances = setupNotificationMock('granted')
      const { result } = renderHook(() => useNotifications(defaultSettings))
      act(() => result.current.notify('input', 'continue?'))
      expect(instances[0].title).toContain('Agent needs input')
    })

    it('requests permission on mount when permission is "default"', () => {
      setupAudioMock()
      const instances = setupNotificationMock('default')
      renderHook(() => useNotifications(defaultSettings))
      expect(global.Notification.requestPermission).toHaveBeenCalled()
    })
  })
})
