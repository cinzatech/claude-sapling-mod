// Opens Sapling Web (ISL) for the session's folder in the Desktop app's
// browser pane. The browser pane is an MCP server named Claude_Browser. Its
// preview_start tool opens the pane when it is closed and reuses a tab that
// already shows the URL; navigate only works while a pane is open.

const PLUGIN = 'sapling-web'
const COMMAND = 'isl'
const OPEN_TOOL = 'mcp__Claude_Browser__preview_start'

// The URL this mod is opening right now. The tool.check hook approves the
// preview_start call for this URL only, and nothing else.
let pendingUrl = null

function message(error) {
  return error && error.message ? error.message : String(error)
}

// Resolves the repository root of `cwd`, or null when `cwd` is not inside a
// Sapling repository.
async function slRoot($, cwd) {
  try {
    const r = await $.process.run(['sl', 'root'], { cwd, timeoutMs: 15000 })
    if (r.exitCode !== 0) return null
    return r.stdout.trim()
  } catch {
    return null
  }
}

// Starts the ISL server, or reuses the running one, and resolves the URL for
// `cwd`. One server serves every repository; only the cwd parameter changes.
async function islUrl($, cwd) {
  const r = await $.process.run(['sl', 'web', '--json', '--no-open'], { cwd, timeoutMs: 60000 })
  if (r.exitCode !== 0) throw new Error('sl web failed: ' + (r.stderr || r.stdout).trim())
  const info = JSON.parse(r.stdout)
  if (typeof info.url !== 'string') throw new Error('sl web gave no url: ' + r.stdout.trim())
  return info.url
}

// Loads `url` in the Desktop app's browser pane through the session tool.
// The call goes through the permission check, which the tool.check hook
// below answers for this URL. Resolves null, or the failure's message.
async function openInBrowserPane($, url) {
  pendingUrl = url
  try {
    const r = await $.tool.call({ tool: OPEN_TOOL, url })
    // A refused call resolves with { deny } instead of throwing.
    if (r && typeof r === 'object' && typeof r.deny === 'string') return r.deny
    // The tool reports a failed page load in its result, with navOk false.
    const text = JSON.stringify(r)
    if (/"navOk":\s*false/.test(text)) return 'the page did not load: ' + text.slice(0, 300)
    return null
  } catch (error) {
    return message(error)
  } finally {
    pendingUrl = null
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Open Sapling Web (ISL) for this folder in the browser pane',
        immediate: true,
      })
    } catch {
      // A taken name must not stop the session.
    }
    return next(e)
  })

  // Approves the preview_start call this mod makes, for the URL it is
  // opening. Every other call of that tool, such as one the model makes,
  // goes on to the engine's own decision.
  on('tool.check', { tool: OPEN_TOOL }, async ($, e, next) => {
    const url = e.input && typeof e.input === 'object' ? e.input.url : undefined
    if (next.origin.plugin === PLUGIN && pendingUrl !== null && url === pendingUrl) {
      return { decision: 'allow', reason: PLUGIN + ' opens Sapling Web for this folder' }
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($) => {
    const cwd = await $.session.cwd()
    const root = await slRoot($, cwd)
    if (root === null) return { text: 'Not inside a Sapling repository: ' + cwd }

    let url
    try {
      url = await islUrl($, cwd)
    } catch (error) {
      return { text: message(error) }
    }

    const surfaces = await $.session.surfaces()
    if (!surfaces.includes('desktop')) {
      return { text: 'Sapling Web is at ' + url + '. The browser pane exists only in the Desktop app.' }
    }

    const failure = await openInBrowserPane($, url)
    if (failure !== null) return { text: 'Could not open the browser pane: ' + failure + '. Sapling Web is at ' + url }

    $.ui.log('Sapling Web opened for ' + root)
    return {}
  })
}
