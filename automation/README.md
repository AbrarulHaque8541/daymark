# Daymark automation (Mistral Workflows service)

Managed-deployment source for the autonomous Daymark maintenance cycle.
Deployed from branch `automation/workflow-service` with build directory `automation`.

Workflow `daymark-maintenance-cycle` takes input `{role, owner, repo, label}`:
- `role=fixer`: triage open issues, debug, push fix branch + PR
- `role=reviewer`: check PR CI, merge green automation PRs, debug failures
Both roles may add one small UI/UX-focused feature PR per run.

Schedules (Asia/Kolkata): fixer every 30 min at :00/:30, reviewer at :10/:40.
