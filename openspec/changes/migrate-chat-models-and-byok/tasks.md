# Tasks

## 1. Inference Worker
- [ ] 1.1 Re-measure neurons for `low` and `medium` with a realistic 2,000-token prompt
- [ ] 1.2 Set `CHAT_BASE_MODEL=@cf/qwen/qwen3.8-27b` and add `RATES` entry `[0.040909, 0.290909]`
- [ ] 1.3 Send `reasoning_effort` (low default, medium for website, code and video)
- [ ] 1.4 Lower `DAILY_NEURONS` and per-person free caps from the measured cost
- [ ] 1.5 Tests for the rate entry, the effort mapping and the cap

## 2. Chat voice
- [ ] 2.1 Remove `meloBackup` and `MELO_MODEL` (`src/index.js` near line 129) and the `MELO_SPEAKS` logic (`src/page.js`)
- [ ] 2.2 Confirm Ava then the browser voice after 6 seconds still works

## 3. Routing and bring-your-own-key
- [ ] 3.1 Implement the four-step order and a hard stop on our spend
- [ ] 3.2 Today "Log in with OpenRouter" is a small link under the key box (`#byor` in `src/page.js`). Make it the primary button and move pasted keys under "advanced"
- [ ] 3.3 Verify Vercel price, Qwen3.8 availability and sign-in billing; then add their-own-Vercel and our-Vercel (off by default)
- [ ] 3.4 Run the chat 5-task eval before and after

## 4. Health check
- [ ] 4.1 Weekly job that calls each configured model once and alerts on 404 or 410
- [ ] 4.2 Run it once before 20 Nov 2026

## 5. Release
- [ ] 5.1 Open PRs from worktrees off `origin/main`, commits signed off
- [ ] 5.2 Owner deploys; verify on chat.flisk.si
