# Daymark automation (Mistral Workflows service)

Autonomous maintenance cycles for the Daymark repo, driven by the `daymark-maintenance-cycle` workflow.

## What it does
- `role=fixer`: triage open issues, debug root cause, push a fix branch + PR (CI gate respected).
- `role=reviewer`: check open PRs and CI, merge green automation PRs, debug failures, comment status.
- Both roles may add ONE small UI/UX-focused feature PR per run (research missing features via README/issues/TODOs).
- Hard rules baked in: only this repo, no force-push, no direct pushes to main, no secrets, respect CI guard scripts, merge only when all checks are green.

## Runtime option A: self-hosted worker (works on the Free plan)
1. `git clone https://github.com/AbrarulHaque8541/daymark.git && cd daymark && git checkout automation/workflow-service`
2. `cd automation && pip install -r requirements.txt` (Python 3.12+)
3. `export MISTRAL_API_KEY=<workspace API key from console.mistral.ai>`
4. `python src/entrypoints/worker.py` — keep this process running. It registers `daymark-maintenance-cycle`.
5. Create the two schedules (time zone Asia/Kolkata):
   - fixer: calendar minute step 30 from :00 (fires :00 and :30 IST), input `{"role":"fixer","owner":"AbrarulHaque8541","repo":"daymark","label":"fixer-cycle"}`
   - reviewer: calendar minute step 30 from :10 (fires :10 and :40 IST), input `{"role":"reviewer","owner":"AbrarulHaque8541","repo":"daymark","label":"reviewer-cycle"}`
   - policy: overlap=1 (skip), pause_on_failure=true, catchup_window_seconds=1800; start_at 2026-10-31T03:30:00Z (09:00 IST)
   Scheduled runs execute as the worker identity (your API key), so your github_app connector credential is used automatically.

## Runtime option B: managed deployment (needs pay-as-you-go on the org)
- Enable pay-as-you-go in console.mistral.ai (Admin > Billing), then deploy:
  deployment `daymark-automation`, github_url `https://github.com/AbrarulHaque8541/daymark`, revision = tip of `automation/workflow-service`, build_directory `automation`, dockerfile `Dockerfile`.
- Schedules then route to deployment `daymark-automation`. The deployment service account needs GitHub access: connect the GitHub app at organization level in Admin > Connectors (shared bot access).

## Files
- `src/workflows/daymark_cycle.py` — workflow + agent instructions (the cycle spec).
- `src/entrypoints/worker.py` — worker entrypoint (`run_worker`).
- `Dockerfile`, `requirements.txt` — container image (mistralai-workflows>=3.10).
