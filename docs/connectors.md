# Connector files

`capabilities/<service>.json` says what a Flisk service can do. `bun scripts/sync-capabilities.mjs` builds
`src/capabilities.generated.js` from these files.

| Field | Meaning |
| --- | --- |
| `auth` | Who may call: `none`, `login.flisk.si`, or `fleet-key` (a fleet API key) |
| `asks` | What a visitor says to ask for it. Required unless the action has `http` |
| `http` | Method and path of the API route |
| `access` | `read`, `write` (changes something) or `spend` (may cost money). Required with `http` |

`access` is a description only. Nothing enforces it yet.

## fleet

`capabilities/fleet.json` lists the six tools of fleet's MCP server. chat does not send a fleet key: it calls fleet as a
trusted site (`src/fleet.js`). `test/fleet-connector.test.js` checks that the five routes chat uses for these actions match
the file. chat's other fleet calls (connections, public links) are not in it. The file does not change what chat does at run time.
