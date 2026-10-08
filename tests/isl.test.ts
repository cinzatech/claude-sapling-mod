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

// Stubs the processes /isl runs: `sl root` in a repository, then `sl web`.
function stubSapling(on, runs: string[][]) {
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv[1] === 'root') return { value: { exitCode: 0, stdout: '/work\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: ISL_JSON + '\n', stderr: '' } }
  })
}

// Stubs the browser pane tools: `tabs` is what tabs_context reports.
function stubBrowser(on, tabs: unknown[], calls: Array<Record<string, unknown>>) {
  on('tool.call', ($, e) => {
    const { tool_use_id, ...call } = e as Record<string, unknown>
    calls.push(call)
    if (e.tool === 'mcp__Claude_Browser__tabs_context') {
      return { result: JSON.stringify({ browserOpen: tabs.length > 0, tabs }) }
    }
    return { result: JSON.stringify({ tabId: 'seed', reused: false, navOk: true }) }
  })
}

test('/isl opens the pane when no tab shows the ISL server', async ($, on) => {
  const runs: string[][] = []
  const calls: Array<Record<string, unknown>> = []
  const logs: string[] = []

  on('session.cwd', () => ({ value: '/work/sub' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, runs)
  stubBrowser(on, [], calls)
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })

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
  expect(logs).toEqual(['Sapling Web opened for /work'])
})

test('/isl reloads and fronts the tab that already shows the ISL server', async ($, on) => {
  const calls: Array<Record<string, unknown>> = []

  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  stubSapling(on, [])
  stubBrowser(
    on,
    [
      { tabId: 'other', origin: 'https://example.com', isActive: true },
      { tabId: 'isl', origin: 'http://localhost:3011', isActive: false },
    ],
    calls,
  )
  on('ui.log', () => ({ value: undefined }))

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer).toEqual({})
  expect(calls).toEqual([
    { tool: 'mcp__Claude_Browser__tabs_context' },
    { tool: 'mcp__Claude_Browser__navigate', url: ISL_URL, tabId: 'isl' },
    { tool: 'mcp__Claude_Browser__tabs_select', tabId: 'isl' },
  ])
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
