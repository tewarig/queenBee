'use client'

import { useEffect, useRef } from 'react'

interface TerminalPaneProps {
  logs: string[]
  interactive: boolean
  running: boolean
  onData: (rawData: string) => void
}

export function TerminalPane({ logs, interactive, running, onData }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const lastIndexRef = useRef(0)
  const prevLogsLengthRef = useRef(0)

  // Always-current refs so closures inside xterm callbacks never go stale
  const stateRef = useRef({ interactive, running, onData })
  const logsRef = useRef(logs)
  useEffect(() => { stateRef.current = { interactive, running, onData } })
  useEffect(() => { logsRef.current = logs }, [logs])

  // Initialize xterm (reinit only if interactive flag changes)
  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (disposed || !containerRef.current) return

      const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 10000,
        disableStdin: !interactive,
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(88, 166, 255, 0.25)',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d8c1',
          brightWhite: '#f0f6fc',
        },
        fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace",
        fontSize: 12,
        lineHeight: 1.4,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current!)
      setTimeout(() => { if (!disposed) fitAddon.fit() }, 10)

      term.onData((data: string) => {
        const { interactive, running, onData } = stateRef.current
        if (interactive && running) onData(data)
      })

      termRef.current = term

      // Flush any logs that arrived before the terminal finished initialising
      const pending = logsRef.current
      if (pending.length > 0) {
        for (const chunk of pending) term.write(chunk)
        lastIndexRef.current = pending.length
        prevLogsLengthRef.current = pending.length
      } else {
        lastIndexRef.current = 0
        prevLogsLengthRef.current = 0
      }
    }

    init()

    return () => {
      disposed = true
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
        lastIndexRef.current = 0
        prevLogsLengthRef.current = 0
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  // Write new chunks as they arrive; clear terminal when logs reset
  useEffect(() => {
    const term = termRef.current
    if (!term) return // terminal not ready yet — init() will flush on mount

    if (logs.length === 0 && prevLogsLengthRef.current > 0) {
      term.reset()
      lastIndexRef.current = 0
    } else if (logs.length > lastIndexRef.current) {
      const newChunks = logs.slice(lastIndexRef.current)
      for (const chunk of newChunks) term.write(chunk)
      lastIndexRef.current = logs.length
    }
    prevLogsLengthRef.current = logs.length
  }, [logs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      {/* Title bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.3rem 0.75rem',
        background: '#111',
        borderBottom: '1px solid #1e1e1e',
        fontSize: '0.68rem',
        fontWeight: 600,
        color: '#4b5563',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        <span>Terminal</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {interactive && running && (
            <span style={{ color: '#60a5fa', fontSize: '0.65rem' }}>click to type</span>
          )}
          {running && (
            <span style={{ color: '#3fb950', fontWeight: 700 }}>● LIVE</span>
          )}
        </span>
      </div>

      {/* xterm mounts here — fills remaining height */}
      <div
        ref={containerRef}
        style={{ flex: 1, background: '#0d1117', overflow: 'hidden', padding: '4px 2px 2px' }}
      />
    </div>
  )
}
