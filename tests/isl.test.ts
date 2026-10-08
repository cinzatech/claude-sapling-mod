import { expect, test } from 'claude-code/testing'

const ISL_JSON = JSON.stringify({
  url: 'http://localhost:3011/?token=abc&cwd=%2Fwork',
  port: 3011,
  token: 'abc',
  pid: 1,
  wasServerReused: false,
  cwd: '/work',
})

test('/isl opens the ISL URL in the browser pane on the desktop', async ($, on) => {
  const runs: string[][] = []
  const navigated: unknown[] = []
  const logs: string[] = []

  on('session.cwd', () => ({ value: '/work/sub' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv[1] === 'root') return { value: { exitCode: 0, stdout: '/work\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: ISL_JSON + '\n', stderr: '' } }
  })
  on('tool.call', ($, e) => {
    navigated.push(e)
    return { result: 'ok' }
  })
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
  expect(navigated.length).toBe(1)
  expect(navigated[0]).toMatchObject({
    tool: 'mcp__Claude_Browser__preview_start',
    url: 'http://localhost:3011/?token=abc&cwd=%2Fwork',
  })
  expect(logs).toEqual(['Sapling Web opened for /work'])
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
  on('process.run', ($, e) => {
    if (e.argv[1] === 'root') return { value: { exitCode: 0, stdout: '/work\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: ISL_JSON, stderr: '' } }
  })

  const answer = await $.command.run({ command: 'isl', args: '' })

  expect(answer.text).toMatch(/^Sapling Web is at http:\/\/localhost:3011/)
})
