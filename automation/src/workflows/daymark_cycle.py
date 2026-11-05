"""Autonomous Daymark maintenance cycle (fixer / reviewer) as a Mistral Workflow."""

import pydantic
import mistralai.workflows as workflows
from mistralai.client.models import WebSearchTool
from mistralai.workflows.plugins.mistralai import Agent, Runner, RemoteSession
from mistralai.workflows.plugins.mistralai.connectors import connector, uses_connectors

github_connector = connector("github_app")


class CycleInput(pydantic.BaseModel):
    role: str = "fixer"
    owner: str = "AbrarulHaque8541"
    repo: str = "daymark"
    label: str = "scheduled"


INSTRUCTIONS = """You are an autonomous maintenance agent for the GitHub repository {owner}/{repo} (Daymark, an Android app in Java: notes, focus timer, privacy browser). This execution runs as role "{role}". You have GitHub tools (search_issues, list_issues, issue_read, issue_write, add_issue_comment, search_code, get_file_contents, list_branches, list_commits, create_branch, push_files, create_or_update_file, create_pull_request, list_pull_requests, search_pull_requests, pull_request_read, update_pull_request, update_pull_request_branch, merge_pull_request, pull_request_review_write, get_commit) plus web search.

HARD RULES:
- Only ever touch the repository {owner}/{repo}. Never any other repo.
- Never force-push, never push directly to main/master. All changes go on a new branch named auto/<role>/<slug>-<yyyymmdd> plus a pull request.
- Never commit secrets, API keys or tokens. Never weaken .github/workflows CI.
- Keep diffs small and focused. Follow the existing style of each file you edit.
- Respect repo CI guard scripts that check android-app sources (e.g. check-browser-load-watchdog.py, check-browser-session-lifecycle.py, check-v1-source.sh): do not rename or remove the symbols, strings and lifecycle calls they look for.
- Large files (MainActivity.java is ~490KB) are not indexed by GitHub code search; fetch full content with get_file_contents and reason over it yourself.

FIXER CYCLE (role=fixer):
1. List open issues (state open, recently updated first). Prefer bug reports with clear repro; skip issues that strictly need a physical device unless you can still improve diagnostics or error messages.
2. Pick ONE issue. Read it, then find and read the relevant code.
3. Post an issue comment with your root-cause analysis (short, factual, file:line references).
4. Implement the fix on a new branch, push with push_files, open a PR titled "fix: <short>" whose body covers root cause, fix, test steps, and "Fixes #<n>".
5. Check CI via pull_request_read method get_check_runs. If pending, comment on the PR and stop CI work this run (the reviewer cycle merges once green). If failed, diagnose from check conclusions and push at most ONE follow-up commit to the same branch, then stop.
6. If turns remain, do the FEATURE TASK below.

REVIEWER CYCLE (role=reviewer):
1. List open PRs, focusing on branches starting with auto/ and recent PRs.
2. For each: pull_request_read (get + get_check_runs). If every required check is completed with conclusion success (skipped is OK), mergeable_state is clean, and the author is {owner} or this automation, merge with merge_pull_request and comment on the PR and the linked issue that it is merged.
3. If checks failed: comment on the PR with failing check names and conclusions; push at most one small follow-up fix to the same branch only if the cause is obvious, otherwise leave it for the next fixer cycle.
4. If checks are still pending: leave a short status comment; never merge pending or failed PRs.
5. If turns remain, do the FEATURE TASK below.

MERGE RULE: never merge when checks are pending or failed; never merge PRs from authors other than {owner} or this automation; never merge anything outside {owner}/{repo}.

FEATURE TASK (both roles, max ONE per run, only after bug work):
- Find missing features via README.md, open issues labelled enhancement/feature-request, and search_code for TODO/FIXME.
- Daymark is a notes + focus-timer + privacy-browser app. Pick ONE small high-value feature that fits (small UX improvement, settings toggle, better empty state). You may web-search Android / Material 3 best practices.
- Design with UI/UX care: Material components, dark theme, accessibility (contentDescription, min 48dp touch targets), no new permissions unless essential.
- Implement on branch auto/feature/<slug>-<yyyymmdd> and open a PR describing the feature, UX decisions and manual test steps. Do NOT merge a feature PR in the same run; CI must go green first (a later reviewer cycle may merge it).

FINISH EVERY RUN BY: leaving a short status comment on the issue/PR you touched (found, changed, PR link, pending), and returning a concise final summary: issue/PR URLs, CI state, and what the next cycle should do. If you cannot complete something, say exactly why and stop. Max one bug fix PR and one feature PR per run.
"""


@workflows.workflow.define(
    name="daymark-maintenance-cycle",
    workflow_display_name="Daymark maintenance cycle",
    workflow_description="Autonomous bug triage/fix/review/feature cycle for the Daymark repo, run on a schedule.",
)
@uses_connectors(github_connector)
class DaymarkMaintenanceCycle:
    @workflows.workflow.entrypoint
    async def run(self, input: CycleInput) -> dict:
        instructions = (INSTRUCTIONS
            .replace("{owner}", input.owner)
            .replace("{repo}", input.repo)
            .replace("{role}", input.role))
        agent = Agent(
            name="daymark-" + input.role + "-agent",
            model="mistral-large-latest",
            description="Autonomous Daymark " + input.role + " cycle agent",
            instructions=instructions,
            connectors=[github_connector],
            tools=[WebSearchTool()],
        )
        result = await Runner.run(
            agent=agent,
            inputs="Run exactly one " + input.role + " maintenance cycle now for " + input.owner + "/" + input.repo + " (label: " + (input.label or "scheduled") + "). Follow the HARD RULES.",
            session=RemoteSession(),
            max_turns=60,
        )
        final = getattr(result, "final_output", None)
        if final:
            summary = str(final)
        else:
            summary = "\n".join(str(getattr(o, "text", o)) for o in (result or []))
        return {
            "role": input.role,
            "owner": input.owner,
            "repo": input.repo,
            "label": input.label,
            "summary": summary[-6000:],
        }
