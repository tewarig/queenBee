import { describe, it, expect, vi } from 'vitest'

vi.mock('./index.js', () => ({
  run: vi.fn()
}))

describe('bin entry point', () => {
  it('should import and call run', async () => {
    const { run } = await import('./index.js')
    await import('./bin.js?test=' + Date.now())
    expect(run).toHaveBeenCalled()
  })
})
