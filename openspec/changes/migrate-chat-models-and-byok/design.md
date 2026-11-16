# Design

## Two separate questions
Whose key (ours, or the person's) is independent of which company it goes through (Cloudflare, OpenRouter, Vercel, other). Routing is therefore two ordered groups: the person's key first, then ours.

## Order
1. Person's own key (OpenRouter login, Vercel if verified, pasted Anthropic or OpenAI key). Cost to us: $0.
2. Our Cloudflare `qwen3.8-27b` with `reasoning_effort` set. Free daily allowance first.
3. Our OpenRouter `:free` models. $0, weaker, rate limited.
4. Our Vercel AI Gateway. Disabled unless a monthly cap is configured.

## Decisions
- When our Cloudflare cap is hit, show "come back tomorrow or add your own key" or fall to OpenRouter free. Never spill silently into a paid backup.
- Model ids live in environment variables so a swap needs no code change.
- Unknown models are billed at the dearest rate in `RATES`, so a missing entry fails safe.
- Measured 2026-11-17 on `qwen3.8-27b` (one tiny prompt each): no setting 26 neurons, `low` 53, `medium` 95. `reasoning_effort` is accepted. Re-measure with a realistic 2,000-token prompt before setting caps.

## Notes
- Cloudflare's email says retired models return 404 or model_not_found; the changelog says HTTP 410 (code 5028). The health check treats both as retired.

## Open questions
- Does Vercel AI Gateway serve Qwen3.8 at a comparable price, and what free credit applies?
- Can "Sign in with Vercel" bill the person's own AI Gateway usage?
- Does `reasoning_effort: low` hold quality on the chat eval?
