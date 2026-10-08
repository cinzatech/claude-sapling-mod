# sapling-web

A Claude Code mod for the Claude Desktop app. It adds the `/isl` command, which
shows Sapling Web (Interactive Smartlog) for the session's repository in the
app's browser pane.

## What `/isl` does

1. Checks that the session folder is inside a Sapling repository.
2. Runs `sl web --json --no-open` there. Sapling starts its web server, or
   reuses the one already running, and returns the URL for that repository.
   One server serves every repository on the machine.
3. Lists the browser pane's tabs. If one already shows the Sapling Web server,
   it reloads that tab with the new URL and fronts it. Otherwise it opens the
   pane with the URL.

On success the command prints nothing. If you have hidden the browser pane, a
toast says Sapling Web is loaded, because no tool can show a pane you hid. On
failure the command prints the reason and the URL, so you can open it yourself.

Outside the Desktop app the command prints the URL. It does not open a
terminal view.

## Requirements

- Claude Desktop with a bundled Claude Code of 2.1.286 or later. Check with
  `/status` in a session.
- Sapling (`sl`) on `PATH`.

## Install

In Claude Desktop, open Settings, then Plugins, then Discover, and install
`sapling-web`. Start a new session, or run `/reload-plugins` in an open one,
and `/isl` is available.

## Development

### Files

- `.claude-plugin/plugin.json`: the plugin manifest
- `hooks/hooks.json`: points at the hooks module
- `hooks/register.js`: registers `/isl` and handles it
- `tests/isl.test.ts`: tests that run without a session

### Load a working copy

The Desktop app takes no `--plugin-dir` flag. Add the folder that holds your
clone to the plugin directories in `~/.claude/settings.json`, then start a new
session. After you change a file, run `/reload-plugins` in the session:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-sapling-mod"
  }
}
```

Remove the entry again before you install the plugin from Discover, or the
two copies load side by side.

### Validate and test

`claude plugin validate` and `claude plugin test` need Claude Code 2.1.287 or
later. If the `claude` on your `PATH` is older, use the binary the Desktop app
bundles. On macOS it lives under
`~/Library/Application Support/Claude/claude-code/<version>/<build>/claude.app/Contents/MacOS/claude`:

```sh
B="$(ls -d "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude | sort -V | tail -1)"
"$B" plugin validate .
"$B" plugin test .
```

Tested with Claude Code 2.1.293 and Sapling 0.2.20260811.
