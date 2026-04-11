import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useSettings } from './use-settings'

const STORAGE_KEY = 'qb:notification-settings'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns defaults on first load (no localStorage entry)', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => {
      expect(result.current.settings.audioEnabled).toBe(true)
      expect(result.current.settings.playOnDone).toBe(true)
      expect(result.current.settings.playOnFailed).toBe(true)
      expect(result.current.settings.playOnInput).toBe(true)
    })
  })

  it('loads saved settings from localStorage after mount', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      audioEnabled: false,
      playOnDone: false,
      playOnFailed: true,
      playOnInput: true,
    }))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(false))
    expect(result.current.settings.playOnDone).toBe(false)
    expect(result.current.settings.playOnFailed).toBe(true)
  })

  it('merges partial localStorage entry with defaults', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ audioEnabled: false }))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(false))
    // unspecified fields fall back to defaults
    expect(result.current.settings.playOnDone).toBe(true)
    expect(result.current.settings.playOnFailed).toBe(true)
    expect(result.current.settings.playOnInput).toBe(true)
  })

  it('returns defaults when localStorage contains invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json}}}')
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(true))
  })

  it('update() patches a single field and persists to localStorage', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(true))
    act(() => result.current.update({ audioEnabled: false }))
    expect(result.current.settings.audioEnabled).toBe(false)
    expect(result.current.settings.playOnDone).toBe(true) // unchanged
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.audioEnabled).toBe(false)
  })

  it('update() persists all four fields to localStorage', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(true))
    act(() => result.current.update({ playOnDone: false, playOnFailed: false }))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.playOnDone).toBe(false)
    expect(stored.playOnFailed).toBe(false)
    expect(stored.audioEnabled).toBe(true) // unchanged
  })

  it('multiple update() calls accumulate correctly', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings.audioEnabled).toBe(true))
    act(() => result.current.update({ audioEnabled: false }))
    act(() => result.current.update({ playOnInput: false }))
    expect(result.current.settings.audioEnabled).toBe(false)
    expect(result.current.settings.playOnInput).toBe(false)
    expect(result.current.settings.playOnDone).toBe(true)
  })
})
