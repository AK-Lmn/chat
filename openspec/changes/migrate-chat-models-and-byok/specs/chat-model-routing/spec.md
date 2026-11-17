## ADDED Requirements

### Requirement: Fixed routing order
Chat SHALL try model sources in this order: the person's own key, our Cloudflare Qwen3.8, our OpenRouter free models, then our Vercel AI Gateway.

#### Scenario: Person has no own key
- **WHEN** a person without their own key sends a message and our Cloudflare allowance is available
- **THEN** the reply comes from `@cf/qwen/qwen3.8-27b` with an explicit `reasoning_effort`

#### Scenario: Cloudflare allowance used up
- **WHEN** the daily Cloudflare budget is spent
- **THEN** chat uses OpenRouter free models, or tells the person to come back tomorrow or add their own key, and does not call a paid backup that has no cap

### Requirement: Paid backup needs a cap
Our Vercel AI Gateway route SHALL stay disabled unless a monthly spend cap is configured.

#### Scenario: No cap configured
- **WHEN** the Vercel route is reached and no monthly cap is set
- **THEN** the route is skipped

### Requirement: Reasoning effort is explicit
Calls to `@cf/qwen/qwen3.8-27b` SHALL set `reasoning_effort` to `low` for normal chat and `medium` for website, code and video tasks, and SHALL NOT rely on the default.

#### Scenario: Normal chat message
- **WHEN** a normal chat message is sent to Qwen3.8
- **THEN** the request carries `reasoning_effort: "low"`
