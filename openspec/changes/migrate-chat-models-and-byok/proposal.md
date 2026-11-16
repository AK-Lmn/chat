# Proposal: migrate chat off retiring Cloudflare models, and add a bring-your-own-key router

## Why

Cloudflare Workers AI stops serving `@cf/qwen/qwen3-30b-a3b-fp8` (the chat brain) and `@cf/myshell-ai/melotts` (the backup voice) on 20 Nov 2026; requests then fail (HTTP 410, code 5028). The replacement `@cf/qwen/qwen3.8-27b` costs about 8 to 10 times more per call, and defaults to the heaviest reasoning level, so the free daily allowance would run out after roughly 20 calls. Chat needs a cheap default, a way for heavy users to pay for themselves, and a check that catches the next retirement early.

## What Changes

- Inference Worker: set `CHAT_BASE_MODEL` to `@cf/qwen/qwen3.8-27b`, add its per-token rate to `RATES`, send `reasoning_effort` explicitly (low for normal chat, medium for website, code and video tasks), and lower the daily neuron budget and per-person free caps to match the new price.
- Chat: remove the MeloTTS backup voice. Ava stays, then the browser voice after 6 seconds.
- Chat: route each request in a fixed order: the person's own key, then our Cloudflare Qwen3.8, then our OpenRouter free models, then our Vercel AI Gateway (off until a monthly cap is set).
- Chat: make "Log in with OpenRouter" the main way to bring your own key. Keep paste-a-key for Anthropic and OpenAI as an advanced option. Add "their own Vercel key" only if Vercel sign-in can bill the person's own account (to verify).
- Add a weekly health check that calls each configured model once and alerts on 404 or 410.

## Capabilities

### New Capabilities
- `chat-model-routing`: the order in which chat tries model sources, and the spend limits on ours.
- `chat-bring-your-own-key`: how a person pays with their own account.
- `chat-model-health`: early warning when a configured model is retired.

### Modified Capabilities
None.

## Impact

- Repos: `flisk-sh/flisk-inference` (`services/app/web/src/worker.ts`, `wrangler.toml`), `flisk-sh/chat` (`src/index.js`, `src/page.js`, `src/loop.js`).
- Cost: each free chat call gets dearer; caps must drop to stay inside the free Cloudflare allowance.
- Deploys are manual and stay the owner's call. Commits are signed off with `git commit -s`.
