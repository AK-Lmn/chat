# Evals and the answer loop

Chat's answers to plain questions ("is this the best song?", "what is Docker?") are tuned by a loop that runs in CI,
not by hand and not by a hosted eval product. It has three layers, each checking the one below.

| Layer | File | What it is | Uses a model |
| --- | --- | --- | --- |
| 1. Scores | `answers/score.mjs` | Deterministic checks on one answer: length, bullets with bold labels, names and numbers, known facts, a real follow-up, same language, no filler. 0 to 100, and every lost point names its check. | no |
| 2. Eval of the scores | `answers/score.test.mjs` + `corpus.json` | Answers a person labelled good and bad. The scorers must keep them at least 25 points apart. Runs on every pull request. | no |
| 3. The loop | `answers/loop.mjs` | Scores the current prompt block, asks a model for a rewrite, scores that, keeps it only if it wins. Runs nightly (`.github/workflows/answer-loop.yml`) and opens a pull request for a kept rewrite. | yes |

The only thing the loop may change is `src/answer-style.js`, one block of the system prompt.

## Why the loop can be trusted to run alone

- **The model never judges.** A model answers and a model proposes; `score.mjs` alone decides. Same answers, same verdict.
- **Held-out questions.** A rewrite is tuned on half the questions and must not score worse on the other half, so it
  cannot win by fitting the examples. The model that proposes never sees which facts are checked.
- **A margin.** A gain under 2 points is noise and is thrown away.
- **Controls.** Greetings and thanks are in the set: a prompt that makes every answer long loses points there.
- **A ratchet.** `baseline.json` records the best mean; `run.mjs --check` fails below it (minus its tolerance).
- **A person merges.** The loop opens a pull request with the before and after table. It never deploys.

## Run it

```bash
export EVAL_URL=https://.../v1/chat/completions   # any OpenAI-compatible address
export EVAL_KEY=...
export EVAL_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct

node evals/answers/run.mjs --answers          # score the current prompt, show the answers
node evals/answers/run.mjs --check            # exit 1 below the baseline
node evals/answers/loop.mjs --rounds 3        # try 3 rewrites, write a better one to src/answer-style.js
node --test evals/answers/*.test.mjs          # layers 1 and 2, no model
```

In GitHub: secrets `EVAL_URL` and `EVAL_KEY` turn the nightly loop on; variables `EVAL_MODEL`, `EDITOR_MODEL` (a
stronger model writes better rewrites) and `EVAL_SAMPLES` are optional. A pull request opened by the workflow's own
token does not start the Check workflow: close and reopen it to run the tests.

## Add a question

Add it to `answers/questions.json` with `facts`: groups of words, one of each group must be in a right answer. Only
facts you are sure of. A question that came from a bad real answer also goes into `corpus.json` with that answer as
`bad` and a good one next to it.

## Limits

- The scores read shape and known facts. An answer with an invented fact that is not on a question's list still passes.
- Scores differ between models: compare with a baseline on the same model.
- 16 questions is a small set. Grow it from real chats before trusting small gains.

## Fact lookup

For a plain question that names something, chat searches Wikipedia before the model answers (`src/lookup.js`) and puts
the sources under the answer. `EVAL_LOOKUP=1 node evals/answers/run.mjs` answers the same way and counts the years in
the answers that are in no source and not in the question. That count is a report, not a gate: it reads years only,
so an invented name or quote still passes.

## Things chat made (pictures, pages)

`answers/made.mjs` does the checks a person does by eye on something chat made: every picture on the page loads, the
answer does not say a picture was made when none shows, and no looked-up sources are added to a request to make
something. `answers/made.json` holds the labelled cases; each bad one is a real complaint (the first: the cat mirror
selfie of 2026-11-15, published with a broken image). CI runs them with the other answer checks.

To check a published page by hand: `node evals/answers/made.mjs https://chat.flisk.si/s/<id>` (exit 1 when a picture is broken).
