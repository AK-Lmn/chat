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
trusted site (`src/fleet.js`). That client takes the method and path of five pod actions from the file, so editing a
route there changes what chat calls. After an edit, run the sync script. `test/fleet-connector.test.js` checks the exact
requests. Sign-in, request bodies and chat's other fleet calls (connections, public links) stay in `src/fleet.js`.
`access` is not enforced.
