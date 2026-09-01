# CLAUDE.md — 拼句 (sentence-builder)

Project rules for Claude in this repo. Global rules (language, git, coding discipline)
live in `~/.claude/CLAUDE.md` and still apply.

## Deployment — Vercel (SSOT)

| Fact | Value |
|------|-------|
| Vercel project | `sentence-builder` (scope `mshmwrs-projects`) |
| Production URL | https://sentence-builder-steel.vercel.app |
| Deploy trigger | **Git integration** — every push to `main` auto-deploys production |
| Build | Vercel auto-detects Vite → `npm run build` → `dist/` (no `buildCommand` in `vercel.json`) |
| Local link | `.vercel/project.json`, gitignored. Missing → `vercel link --yes` |
| Env vars | `NVIDIA_API_KEY` (Production) — unused by `src/`, leftover. The Gemini key is user-supplied at runtime, never a build secret. |

### Ship flow

`main` is deploy-on-push, so nothing lands there directly.

1. Branch in a worktree: `git worktree add .worktrees/<slug> -b <slug>`
2. `npm test` (49 engine tests, zero-dependency) and `npm run build` must pass
3. Commit → push → `gh pr create` → **stop and hand the PR to the user**
4. After the user merges: **do not run `vercel --prod`.** The merge itself deploys.
   Wait ~1 min for the build.
5. Verify (below) before saying the change is live.

### Verify — required after every merge

```bash
bash scripts/verify-deploy.sh "<a literal this commit introduced>"
```

It checks `origin/main` SHA == the GitHub Production deployment SHA, deployment state
`success`, production HTTP 200, and — with the optional argument — greps the live
`/assets/*.js` bundle for a string the change introduced. Exit 0 = live production is
`origin/main`. A SHA match alone is not proof: Vercel's build cache can serve a stale
bundle, which is exactly what the literal check catches.

Never invite the user to "go try it" without a passing run of this script in the same
response.

### Manual deploy — fallback only

`vercel --prod` (add `--force` to bypass a stale build cache). Use it only when the Git
deploy failed, is stuck, or served a stale bundle. Cost: a CLI deploy registers no GitHub
deployment, so `scripts/verify-deploy.sh` reports a SHA mismatch until the next push to
`main` — say so explicitly instead of treating the FAIL as noise.

### Gotchas

- **Google login is bound to the production domain.** `src/firebase.js` sets
  `authDomain: "sentence-builder-steel.vercel.app"` and `vercel.json` reverse-proxies
  `/__/auth/**` + `/__/firebase/**` to `pinju-web.firebaseapp.com`, so the auth handler is
  same-origin (Chrome drops the session otherwise). Changing the production domain means
  changing all three together: `authDomain`, the `vercel.json` rewrites, and the Firebase
  Console authorized domains. Preview deploys get their own URL but still ship the
  hard-coded production `authDomain`, so a login started on a preview lands its session
  on the production origin — test Google login on production, not on a preview URL.
- **A daily robot pushes to `main`.** `.github/workflows/daily-cnn-sentences.yml` runs at
  04:00 GMT+8, commits `public/daily-sentences.json`, and thereby triggers a production
  deploy. A deploy you did not start is usually that; check the deployment SHA before
  assuming your own change shipped.
- **The daily robot needs its own Gemini key.** It doesn't just scrape CNN headlines —
  `scripts/fetch-cnn-sentences.mjs` also pre-generates every sentence's puzzle (translation
  + tiles + notes) via `generatePuzzlesBatch` in `src/generate.js`, using the repo secret
  `GEMINI_API_KEY`, so the client never calls Gemini for "今日例句" (that's what makes it
  playable offline / on minimal data). Without that secret set (GitHub repo Settings →
  Secrets and variables → Actions), the workflow fails before writing anything and the site
  keeps serving whatever `daily-sentences.json` it already has.
- **The whole day's batch is ONE Gemini call, not one per headline.** An earlier version
  called `generatePuzzleFromEnglish` per sentence (12 calls) and blew through a free-tier
  key's per-minute quota after ~6 — see run #8/#9 in the Actions history for what that
  looked like. `generatePuzzlesBatch` sends all headlines in a single prompt and expects
  back a same-length, same-order JSON array; a malformed or missing entry for one headline
  is dropped (that sentence just won't appear in `daily-sentences.json`), it doesn't fail
  the whole run. `BATCH_MAX_OUTPUT_TOKENS` (16384) needs to stay well above whatever
  `POOL_SIZE` headlines' worth of zh/accepted/distractors/notes actually costs — raise it
  if `POOL_SIZE` in `scripts/fetch-cnn-sentences.mjs` grows.
- **`dist/` is gitignored** but a stale copy exists on disk. Never deploy from a local
  build artifact; Vercel builds from the repo.
