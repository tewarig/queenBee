import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import HomePage from './page'

vi.mock('@/components/AgentOrchestrator', () => ({
  AgentOrchestrator: () => <div>Agent Orchestrator Mock</div>
}))

describe('HomePage', () => {
  it('renders AgentOrchestrator', () => {
    render(<HomePage />)
    expect(screen.getByText('Agent Orchestrator Mock')).toBeInTheDocument()
  })
})
