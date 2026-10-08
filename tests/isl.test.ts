import { expect, test } from 'claude-code/testing'

const ISL_URL = 'http://localhost:3011/?token=abc&cwd=%2Fwork'

const ISL_JSON = JSON.stringify({
  url: ISL_URL,
  port: 3011,
  token: 'abc',
  pid: 1,
  wasServerReused: false,
  cwd: '/work',
})

const ISL_TAB = { tabId: 'isl', origin: 'http://localhost:3011', isActive: false }

// Stubs the processes /isl runs: `sl root` in a repository, then `sl web`.
function stubSapling(on, runs: string[][]) {
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv[1] === 'root') return { value: { exitCode: 0, stdout: '/work\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: ISL_JSON + '\n', stderr: '' } }
  })
}

// Stubs the browser pane tools: `tabs` is what tabs_context reports, and
// `hidden` adds the note the tool prints while the user has hidden the pane.
function stubBrowser(on, tabs: unknown[], calls: Array<Record<string, unknown>>, hidden = false) {
  on('tool.call', ($, e) => {
    const { tool_use_id, ...call } = e as Record<string, unknown>
    calls.push(call)
    if (e.tool === 'mcp__Claude_Browser__tabs_context') {
      const note = hidden ? '\nThe Browser pane is currently hidden.' : ''
      return { result: JSON.stringify({ browserOpen: tabs.length > 0, tabs }, null, 2) + note }
    }
    return { result: JSON.stringify({ tabId: 'seed', reused: false, navOk: true }) }
  })
}

// Collects the toasts the mod shows.
function stubToasts(on, toasts: string[]) {
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
}

test('/isl opens the pane when no tab shows the ISL server', async ($, on) => {
  const runs: string[][] = []
  const calls: Array<Record<string, unknown>> = []
  const toasts: string[] = []

  on('session.cwd', () => ({ value: '/work/sub' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, runs)
  stubBrowser(on, [], calls)
  stubToasts(on, toasts)

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer).toEqual({})
  expect(runs).toEqual([
    ['sl', 'root'],
    ['sl', 'web', '--json', '--no-open'],
  ])
  expect(calls).toEqual([
    { tool: 'mcp__Claude_Browser__tabs_context' },
    { tool: 'mcp__Claude_Browser__preview_start', url: ISL_URL },
  ])
  expect(toasts).toEqual([])
})

test('/isl reloads and fronts the tab that already shows the ISL server', async ($, on) => {
  const calls: Array<Record<string, unknown>> = []
  const toasts: string[] = []

  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, [])
  stubBrowser(on, [{ tabId: 'other', origin: 'https://example.com', isActive: true }, ISL_TAB], calls)
  stubToasts(on, toasts)

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer).toEqual({})
  expect(calls).toEqual([
    { tool: 'mcp__Claude_Browser__tabs_context' },
    { tool: 'mcp__Claude_Browser__navigate', url: ISL_URL, tabId: 'isl' },
    { tool: 'mcp__Claude_Browser__tabs_select', tabId: 'isl' },
  ])
  expect(toasts).toEqual([])
})

test('/isl shows a toast when the pane is hidden', async ($, on) => {
  const calls: Array<Record<string, unknown>> = []
  const toasts: string[] = []

  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, [])
  stubBrowser(on, [ISL_TAB], calls, true)
  stubToasts(on, toasts)

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer).toEqual({})
  expect(calls.map((c) => c.tool)).toEqual([
    'mcp__Claude_Browser__tabs_context',
    'mcp__Claude_Browser__navigate',
    'mcp__Claude_Browser__tabs_select',
  ])
  expect(toasts).toEqual(['Sapling Web is loaded. Open the browser pane to see it.'])
})

test('/isl reports a refused browser pane call', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, [])
  on('tool.call', () => ({ deny: 'no verdict' }))

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer.text).toMatch(/^Could not open the browser pane: no verdict\. Sapling Web is at http:\/\/localhost:3011/)
})

test('/isl reports a folder that is not a Sapling repository', async ($, on) => {
  on('session.cwd', () => ({ value: '/elsewhere' }))
  on('process.run', () => ({ value: { exitCode: 255, stdout: '', stderr: 'abort: no repository found' } }))

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer.text).toBe('Not inside a Sapling repository: /elsewhere')
})

test('/isl gives the URL when there is no desktop surface', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  stubSapling(on, [])

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer.text).toMatch(/^Sapling Web is at http:\/\/localhost:3011/)
})
