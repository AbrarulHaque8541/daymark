# ADR 0001: Cross-platform shell and browser engine

- Status: Proposed; prototype evidence required before a final framework selection.
- Date: 2026-10-22
- Related: issue #325, PR #326, browser viewport issue #221.
- Scope: Windows/Linux desktop shell and browser-engine strategy. This ADR does not authorize a production rewrite.

## Context

Daymark currently has a native Android Java shell, Android System WebView, encrypted local task storage, and explicit HTTPS/online-consent policy. The product goal is to add Windows and Linux while preserving the current Android installation identity and release safety. HarmonyOS/OpenHarmony must be assessed separately.

“Cross-platform UI” and “full browser engine” are different requirements. A shared UI framework does not automatically provide a browser engine, Chrome/Firefox extension APIs, consistent page rendering, or identical network-policy enforcement. Likewise, swapping Android WebView for another engine does not deliver a desktop application.

## Options considered

| Option | Strengths | Costs and risks | Current disposition |
|---|---|---|---|
| Keep native Android + add a separate desktop shell | Lowest risk to current Android package, signer, lifecycle, and release gates; allows a measured desktop experiment | Two UI shells and some adapter work; duplicated UI polish | Safe fallback and baseline |
| Flutter shared UI | Strong shared widget layer across Android, Windows, and Linux; good fit for a consistent task workspace | Android migration risk; browser support remains plugin/engine-specific; desktop packaging, accessibility, encrypted storage and parity still need implementation | Prototype candidate; not selected without measured comparison |
| Tauri 2 shared web UI | Reuses web UI skills; relatively small shell in many cases; desktop and Android targets are available | OS WebViews differ; Linux WebKitGTK and Android System WebView remain engine dependencies; privileged native bridge must be tightly scoped; browser-grade extension engine is not included | Prototype candidate for desktop shell, not a browser-engine solution |
| One shared web/PWA UI | Fastest visual prototype and broad reach | Cannot safely assume native filesystem/keystore/background behavior; not equivalent to installable native desktop app; browser engine remains the host browser | Useful UI experiment only |
| Embed a dedicated browser engine | More control over rendering/engine version and browser-specific capabilities | Larger artifacts, engine update/security maintenance, platform-specific integration, higher memory/battery cost; desktop and Android choices may differ | Separate engine spike; no production swap yet |
| OpenHarmony native/ArkTS adapter | Direct path to platform-specific APIs if the target environment is available | Separate toolchain, lifecycle, packaging and API compatibility; Android APK compatibility must not be assumed | Feasibility gate; unsupported until an actual build and runtime test exist |

## Decision

Do not migrate the production Android shell yet. Preserve it as the reference implementation while measuring two independent prototypes:

1. **Desktop-shell spike:** compare Flutter and Tauri 2 using the same small task-list/add/complete flow on Windows and Linux. Do not include real user data. Measure clean build reproducibility, startup time, idle memory, package size, keyboard/accessibility behavior, offline operation, and encrypted local persistence.
2. **Browser-engine spike:** separately compare the existing Android System WebView with GeckoView for Android browser requirements. Validate HTTPS-only navigation, HTTP downgrade/redirect handling, offline-by-default plus explicit consent, `target=_blank`, downloads, permissions denied by default, clear-site-data behavior, renderer recovery, and blank-viewport diagnostics. Record engine version and artifact size. Do not conflate this result with desktop-shell selection.

No framework or browser engine wins by marketing claims alone. Publish raw measurements and test logs with the exact commit, runner/device, OS/API, architecture, engine version, and test scenario IDs. If a required guarantee cannot be implemented on a candidate, mark that capability unsupported rather than weakening the security contract.

## Acceptance gates

A candidate may be recommended for implementation only after all applicable gates pass:

- [ ] Reproducible clean build on Windows and Linux cloud runners.
- [ ] The same synthetic task contract suite passes on both platforms.
- [ ] Local data persists across restart and is encrypted at rest; keys are not hard-coded or exported.
- [ ] No telemetry, analytics, ad SDKs, or task-content network calls are introduced.
- [ ] HTTPS-only and explicit-consent decisions are enforced by an app-owned policy boundary, not delegated to the engine alone.
- [ ] Keyboard, touch, screen-reader semantics, scaling, and high-contrast behavior receive a recorded review.
- [ ] Startup time, idle memory, install size, and engine/update maintenance costs are measured and reported.
- [ ] Android app ID/namespace `com.abrar.daymark`, production signer pin, version monotonicity, and existing release gates remain unchanged.
- [ ] Physical-device evidence remains separately required for Android behavior that CI/emulators cannot establish.
- [ ] OpenHarmony is labeled unsupported/experimental until its own toolchain build and target-runtime evidence exists.

## Consequences

- No production dependency, app identity, encryption implementation, browser engine, or release configuration changes as a result of this ADR.
- The existing Android implementation remains the behavior baseline until the prototype evidence supports a deliberate decision.
- “Windows/Linux supported” and “HarmonyOS supported” cannot be claimed from shared host tests alone.
- Browser features must be described honestly: System WebView is not a complete Chrome/Firefox extension runtime. A dedicated engine is a separate product and maintenance commitment.

## References

- Flutter platform FAQ: https://docs.flutter.dev/resources/faq
- Tauri 2: https://tauri.app/
- Tauri platform prerequisites: https://v2.tauri.app/start/prerequisites/
- OpenHarmony ArkTS guide: https://github.com/openharmony/docs/blob/master/en/application-dev/quick-start/arkts-get-started.md
- Mozilla GeckoView: https://mozilla.github.io/geckoview/

---

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools; repository source and architecture review
Timestamp (UTC): 2026-10-22T18:35:00Z
