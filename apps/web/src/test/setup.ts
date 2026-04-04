import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock EventSource
global.EventSource = vi.fn().mockImplementation(() => ({
  close: vi.fn(),
  onmessage: null,
})) as any

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve([]),
}) as any
