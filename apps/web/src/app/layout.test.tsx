import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RootLayout from './layout'

describe('RootLayout', () => {
  it('renders children', () => {
    render(
      <RootLayout>
        <div data-testid="child">Child Content</div>
      </RootLayout>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
