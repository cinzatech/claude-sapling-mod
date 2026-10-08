// Opens Sapling Web (ISL) for the session's folder in the Desktop app's
// browser pane. The browser pane is an MCP server named Claude_Browser. The
// mod lists its tabs, reloads the one that already shows the ISL server if
// there is one, and opens the pane otherwise.

const PLUGIN = 'sapling-web'
const COMMAND = 'isl'
const TABS = 'mcp__Claude_Browser__tabs_context'
const SELECT = 'mcp__Claude_Browser__tabs_select'
const NAVIGATE = 'mcp__Claude_Browser__navigate'
const OPEN = 'mcp__Claude_Browser__preview_start'

// What this mod is opening right now. The tool.check hook approves the
// browser pane calls for this URL and tab only, while a run is in progress.
let pendingUrl = null
let pendingTabId = null

function message(error) {
  return error && error.message ? error.message : String(error)
}

// The text a tool result carries, whatever shape the engine hands back.
function resultText(r) {
  if (typeof r === 'string') return r
  if (!r || typeof r !== 'object') return ''
  if (typeof r.text === 'string') return r.text
  if (typeof r.result === 'string') return r.result
  if (r.result && typeof r.result === 'object') return resultText(r.result)
  if (Array.isArray(r.content)) return r.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n')
  return JSON.stringify(r)
}

// The reason a tool call was refused or failed, or null when it went through.
function failureOf(r) {
  if (r && typeof r === 'object' && typeof r.deny === 'string') return r.deny
  const text = resultText(r)
  if (/"navOk":\s*false/.test(text)) return 'the page did not load: ' + text.slice(0, 300)
  return null
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

// Finds the open browser tab on the ISL server's origin: `{ tabId, isActive }`,
// or null when there is none or the tab list cannot be read.
async function islTab($, url) {
  const origin = new URL(url).origin
  let tabs
  try {
    const r = await $.tool.call({ tool: TABS })
    if (failureOf(r) !== null) return null
    const parsed = JSON.parse(resultText(r).trim().replace(/^[^{]*/, '').replace(/[^}]*$/, ''))
    tabs = Array.isArray(parsed.tabs) ? parsed.tabs : []
  } catch {
    return null
  }
  const tab = tabs.find((t) => t && typeof t.tabId === 'string' && t.origin === origin)
  return tab ? { tabId: tab.tabId, isActive: tab.isActive === true } : null
}

// Shows `url` in the Desktop app's browser pane: reloads the tab already on
// the ISL server, or opens the pane. Resolves null, or the failure's message.
async function openInBrowserPane($, url) {
  pendingUrl = url
  pendingTabId = null
  try {
    const tab = await islTab($, url)
    if (tab !== null) {
      pendingTabId = tab.tabId
      const r = await $.tool.call({ tool: NAVIGATE, url, tabId: tab.tabId })
      const failure = failureOf(r)
      if (failure !== null) return failure
      if (!tab.isActive) await $.tool.call({ tool: SELECT, tabId: tab.tabId })
      return null
    }
    return failureOf(await $.tool.call({ tool: OPEN, url }))
  } catch (error) {
    return message(error)
  } finally {
    pendingUrl = null
    pendingTabId = null
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

  // Approves the browser pane calls this mod makes while it opens a URL:
  // listing the tabs, loading that URL, and fronting the tab it found. Every
  // other call of these tools, such as one the model makes, goes on to the
  // engine's own decision.
  on('tool.check', { tool: [TABS, SELECT, NAVIGATE, OPEN] }, async ($, e, next) => {
    const input = e.input && typeof e.input === 'object' ? e.input : {}
    const ours =
      next.origin.plugin === PLUGIN &&
      pendingUrl !== null &&
      (e.tool === TABS ||
        (e.tool === SELECT && input.tabId === pendingTabId) ||
        (e.tool === NAVIGATE && input.url === pendingUrl && input.tabId === pendingTabId) ||
        (e.tool === OPEN && input.url === pendingUrl))
    if (ours) return { decision: 'allow', reason: PLUGIN + ' opens Sapling Web for this folder' }
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
