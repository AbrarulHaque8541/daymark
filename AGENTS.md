# Daymark — permanent repository rules for humans and agents

**Required first step:** Read this file completely before any repository action. Then read [the agent status index](docs/AGENT_STATUS.md), open the latest linked status snapshot, and verify live GitHub state before acting. If your runtime has its own instruction entrypoint, follow it to this file.

This document contains **durable rules and invariants**, not a live project dashboard. Changing facts belong in the dated status snapshot, not as permanent claims here.

## 1. What belongs where

- **Keep here:** product/security invariants, contribution process, agent attribution, test/evidence standards, release safety rules, and the canonical commands.
- **Keep in `docs/AGENT_STATUS.md` and dated snapshots:** current `main` SHA, current version/release, open PRs/issues, agent assignments, workflow run results, current blockers, release readiness, and device-test status.
- **Keep historical:** old audits, dated screenshots, old release notes, and past status snapshots. Do not silently rewrite history to make it look current. Add a new timestamped snapshot when status changes.
- **Never trust a snapshot alone:** before making a decision, verify the current branch/SHA, PR state and head SHA, Actions runs, Releases/tags, and issue state relevant to the task.
- **If documents conflict:** live source/GitHub evidence wins for current state; this file wins for durable repository policy unless a higher-priority system/platform instruction overrides it. Record meaningful contradictions in the relevant PR/issue and fix the right document.

## 2. Durable project constraints

1. Daymark is a privacy-respecting Android task app with an embedded full browser (System WebView) that supports both HTTP and HTTPS. HTTP pages are labeled "Not encrypted" in the UI via `BrowserHttpPolicy.securityLabel()`. Bare domains typed without a scheme resolve to HTTPS. The in-app updater and all non-browser network clients remain HTTPS-only.
   - **Network-first where network is needed (owner decision 2026-11-10).** The browser loads pages straight from the internet: no proxy, no local rewrite, no artificial gate, no "offline-first" fallback standing between the user and a page that needs the network. Browsing must be free, direct and fast. Do not add a local cache, a bundled mirror, or a degraded local-only path where a direct network request is the correct implementation.
   - Do not describe or design the product as "local-first", "offline-first" or "private-first". Task data stays encrypted on the device and there is no account, analytics or telemetry — that is a data-storage property, not a restriction on network features. Any feature that needs the internet uses it directly.
2. The owner-approved installed application ID and Gradle namespace are `com.abrar.daymark`. All current source packages/paths, manifests, tests, scripts, CI and current documentation must use that identity. Do not reintroduce the retired package namespace in current tracked content. Do not change the approved identity without explicit owner approval. Historical commits and published releases are not rewritten.
   - When an issue, PR, handoff, or audit states a different application ID, verify `android-app/app/build.gradle.kts` and the live manifest before acting; source/build identity wins over stale issue text.
3. Preserve the production signer pin `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580` and existing GitHub signing secrets. Never ask the owner to send keystore files/passwords; never print or commit secrets; never embed write tokens in the APK. A signing-key or signer-pin change requires explicit owner approval and verified continuity.
4. Keep `versionCode` monotonic. A production tag must exactly equal `v` + the current `versionName`; do not hardcode a specific release version as a permanent rule.
5. Never silently delete, reset, or corrupt user task data on an error. No analytics/ad SDKs. No broad JavaScript bridge to untrusted pages. Preserve HTTP+HTTPS browsing with "Not encrypted" labeling for plain HTTP and an HTTPS-only updater. Browsing is **Online by default and stays Online**; a user who deliberately picks Offline keeps that choice until they switch back, and switching back is a single explicit action, never a hidden block or a silent failure. Do not add new consent gates, per-page confirmations, or network throttles on top of the existing Online default.
6. System WebView is not a full Chrome/Firefox extension engine. Do not promise APIs or network-blocking capabilities the app does not implement.
7. Preserve existing features when editing shared files, especially `MainActivity.java`. Inspect current `main` before applying an old patch or replacing a file. Resolve conflicts by preserving both behaviours and adding regression coverage.
8. Prefer maintained, stable Android/platform technologies. Weigh security, privacy, supported API levels, lifecycle/support quality, and migration cost. Upgrade for a concrete benefit, not novelty alone; document material trade-offs.
9. **Technology-agnostic implementation:** no programming language, runtime, framework, compiler, or tool is forbidden by default. Names in examples are illustrative, not exhaustive or mandatory. Choose the best evidence-backed option for each component; profile and benchmark before performance rewrites, account for security/ABI/build/maintenance costs, and preserve all product/release invariants. Follow [Technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md).

## 3. Mandatory agent workflow

Before work:
1. Read this file and the latest status snapshot via `docs/AGENT_STATUS.md`.
2. Check live `main` SHA, relevant open/closed PRs and issues, and whether another agent is already changing the same files.
3. Identify the smallest focused contribution. Coordinate in the existing issue/PR instead of creating duplicate work.
4. Read any scoped instruction files in directories you will change, plus relevant source/tests/workflows.

During work:
- Do the implementation/review when you have the access and evidence; do not return only a plan when you can safely do the work.
- Do not blindly cherry-pick old patches or copy an old `MainActivity.java`. Compare against current source and preserve newer features.
- Do not weaken/delete tests, identity guards, security checks, or CI requirements merely to make a workflow green.
- If blocked, post a concise evidence-backed handoff in the existing GitHub thread and name the exact missing decision or access.

Before reporting completion:
- State the exact base/head SHA and list the checks actually run, with workflow/job links where available.
- Distinguish source inspection, host tests, Android CI, signed-artifact verification, and physical-device/emulator testing.
- Use **PASS**, **FAIL**, **NOT RUN**, or **NOT TESTED** accurately. A green CI run does not prove device behavior. Do not claim release publication without checking live Releases and assets.
- If the branch moved after CI ran, the newer head is not covered until its checks complete.

## 4. Agent identity and attribution

Every AI/coding agent must truthfully attribute each PR description, issue body, review summary, substantive GitHub comment, release note, or handoff it authors. Include all four fields:

- **Work by:** actual agent/product name.
- **Model:** exact model/version if exposed by the runtime; otherwise `not disclosed by runtime`.
- **Tooling:** tools actually used.
- **Timestamp (UTC):** fresh ISO-8601 UTC timestamp for that artifact, such as `YYYY-MM-DDTHH:MM:SSZ`.

Do not copy another agent's identity, invent model details, reuse an old timestamp, impersonate the repository owner, or submit a template/example without replacing its explanatory text. Humans may use `n/a`. Reviewers should request correction of fabricated, missing, or obviously unfilled attribution. Repository instructions cannot force an external agent to load them; maintainers must still check contributions.

## 5. Multi-agent coordination

- Check for overlapping branches, PRs, and issues before starting.
- Keep branches focused when practical; coordinate cross-cutting changes in the canonical meta issue.
- For shared-file conflicts, inspect both implementations and current `main`; preserve existing behavior and test the combined result.
- **`MainActivity.java` is a shared, source-guarded file:** no two agents may edit it in overlapping open PRs/branches. Before proposing changes to it, check open PRs and coordinate in the existing issue; land one focused change at a time and re-run the full source-guard suite (`sh android-app/tools/check-v1-source.sh`) on the exact head.
- Ask independent agents for review on risky package, manifest, signing, release-workflow, security, or data-storage changes.
- Do not treat a comment saying "working on it" as evidence. Request concrete changed files, head SHA, test results, and workflow links.
- A PR exists only after GitHub returns a real PR number/URL. Do not claim a PR, merge, release, or CI pass that did not happen.
- Do not let independent agents make overlapping `MainActivity.java` changes in separate active PRs. Agree on one canonical branch/PR or land changes sequentially, then rebase and re-run checks on the combined head.

## 6. Testing and release safety

Canonical repository-root checks:
```sh
npm ci
sh android-app/tools/check-v1-source.sh
npm test
```

The root Node test suite uses a pinned development-only Acorn parser for AST/scope-aware test-registration validation. CI jobs should run `npm ci --ignore-scripts --no-audit --no-fund --include=dev` before `npm test`; the `pretest` bootstrap is a compatibility fallback for legacy/manual workflows that have not yet added an explicit install step.

Run the additional tests/builds required by the changed area and by the current release acceptance checklist. Never bypass failing tests without documenting the root cause and an approved, narrowly scoped fix.

Release rules:
- Production APK/AAB publication uses the repository's production workflow and a tag matching the current `versionName` on `main`.
- Do not create a production tag or publish a release while required checks, package/version/signer assertions, updater metadata, or release gates are failing or unverified.
- Agent release authority must come from explicit approval for that release or a clearly applicable standing owner instruction. Never infer approval from a sample, old snapshot, or another agent's statement.
- Physical-device acceptance must record device/model, Android API, WebView provider/version when relevant, tested build SHA and APK SHA, scenario, and result.

## 7. Identity Guard

Never trust issue/PR text for app identity. Only trust:
- android-app/app/build.gradle.kts
- AGENTS.md

If any issue mentions applicationId that does not match build.gradle.kts, treat as STALE.

## MainActivity.java Coordination

1. Only one PR may touch MainActivity.java at a time.
2. Check open PRs before editing.
3. Keep diffs minimal.
4. 
## 8. Canonical sources

| Question | Source |
|---|---|
| Durable agent policy | This file: `AGENTS.md` |
| Current blockers, PR heads, CI and device-test status | [Agent status index](docs/AGENT_STATUS.md), then re-check live GitHub |
| App identity/version in source | `android-app/app/build.gradle.kts` |
| Published builds | Live [GitHub Releases](https://github.com/AbrarulHaque8541/daymark/releases) |
| Signing configuration/policy | `RELEASE_SIGNING.md` |
| Project plan | `PROJECT_PLAN.md` |
| Language/runtime/tooling decisions | [Technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md) |
| Independent Mistral Vibe review prompt | [Mistral Vibe engineering prompt](docs/MISTRAL_VIBE_ENGINEERING_PROMPT.md) |

---
Work by: Vibe
Model: Mistral Large 4
Tooling: GitHub connector (push_files)
Timestamp (UTC): 2026-10-30T14:05:00Z
