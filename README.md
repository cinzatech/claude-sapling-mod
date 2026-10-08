# sapling-web

A Claude Code mod that adds the `/isl` command. The command starts Sapling Web
(ISL) for the session's folder, or reuses the running server, and loads it in
the Claude Desktop app's browser pane.

The browser pane exists only in the Desktop app. In other apps the command
prints the URL.

## Files

- `.claude-plugin/plugin.json`: the plugin manifest
- `hooks/hooks.json`: points at the hooks module
- `hooks/register.js`: registers `/isl` and handles it
- `tests/isl.test.ts`: tests that run without a session

## Load it in the Desktop app

The Desktop app takes no `--plugin-dir` flag. Add this folder to the plugin
directories in `~/.claude/settings.json`, then start a new session:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/jacobo.bouzas.external/code/claude-sapling-mod"
  }
}
```

## Validate and test

The Desktop app bundles its own Claude Code. Use that binary when the one on
`PATH` is older than 2.1.287:

```sh
B="$HOME/Library/Application Support/Claude/claude-code/2.1.293/8433d0d9cd0d/claude.app/Contents/MacOS/claude"
"$B" plugin validate .
"$B" plugin test .
```

Tested with Claude Code 2.1.293 and Sapling 0.2.20260811.
