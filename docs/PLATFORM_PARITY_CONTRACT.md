# Platform Parity and Test Evidence Contract

Status: proposed architecture contract for issue #325. This document does not claim that cross-platform parity is implemented.

## The goal—and the hard limit

Daymark should have **one product contract and one shared behavioral test suite** so the same task, browser-policy, validation, and error-handling scenarios mean the same thing on every platform. A Linux/Windows cloud agent should be able to run most product tests and produce evidence even when no Android phone is available.

However, one test on one physical device cannot prove every other platform is correct. Operating-system integration, rendering, input, lifecycle, storage APIs, permissions, WebView/engine versions, and hardware differ. The efficient target is:

1. Test shared behavior once against the shared core.
2. Run the same contract suite against every platform adapter in CI.
3. Run platform-specific integration tests on each available OS/emulator.
4. Reserve physical-device checks for behaviors that cannot be credibly simulated.
5. Reuse artifacts and test definitions so work is not duplicated.

A green Linux run must never be reported as Android device acceptance. The test report should explicitly show which evidence is shared and which is platform-specific.

## Required architecture

### A. Shared product contract

Create a platform-neutral core for deterministic logic only:

- Task/domain models, validation, ordering, filtering, and state transitions.
- Stable serialization/schema contract and migration fixtures.
- Browser address parsing and navigation/security decisions.
- Explicit online-consent state machine and HTTPS-only policy decisions.
- Typed errors and recovery decisions.
- Test fixtures that do not contain real personal task data.

The core must not depend on Android Context, Android Keystore, Android AtomicFile, Windows APIs, WebView classes, filesystem paths, or UI widgets. Keep encryption and platform APIs behind interfaces/adapters. Do not move task data to a cloud service to achieve parity.

### B. Platform adapters

Each platform implements the same documented interfaces and runs the same conformance suite:

- Android: current native app and its existing storage/key adapters.
- Windows and Linux: a desktop shell and local encrypted storage adapter, only after a measured framework spike.
- HarmonyOS/OpenHarmony: separate native/ArkTS feasibility and adapter work; do not assume Android APK compatibility or automatic Flutter/Tauri support.
- Other platforms: marked experimental until a real target and CI/build path are identified.

An adapter must not silently weaken policy to fit a platform. If an OS cannot provide a required guarantee, mark that capability unsupported or experimental rather than pretending parity.

### C. UI and browser are separate contracts

Shared product semantics do not require identical pixels. The UI must provide equivalent information, actions, keyboard/touch accessibility, and error recovery, while adapting to screen size and input mode. Visual tests use per-platform baselines where native rendering differs.

The browser is a separately replaceable engine adapter behind a common policy boundary. Test policy independently of the engine, then test engine integration separately. The adapter contract covers:

- HTTPS-only navigation and downgrade rejection.
- Explicit online consent and offline behavior.
- Redirects, external intents, `target=_blank`, popups, downloads, permission prompts, and error/retry.
- Clear site data/history and lifecycle/recovery.
- Safe handling of untrusted pages; no broad privileged JavaScript bridge.
- Honest capability reporting: System WebView is not a standalone Chrome/Firefox-class engine or a full extension runtime.

Never trust an engine to enforce all product policy by itself. A new engine is not approved until the security and navigation conformance suite passes.

## Test layers and what they prove

| Layer | Runs where | Evidence it can provide | Does not prove |
|---|---|---|---|
| Shared-core unit/contract tests | Linux and Windows CI; optionally Android host runner | Deterministic product rules, validation, serialization fixtures, policy decisions | OS APIs, rendering, real browser-engine behavior |
| Adapter conformance tests | Every platform CI target that can build | Each adapter follows the same interface/behavior contract | Unavailable hardware or OEM-specific behavior |
| Build + static/security checks | Per-platform CI | Source compiles; packaging/configuration and guardrails pass | App works correctly after launch |
| Automated GUI smoke tests | Linux/Windows desktop runners; Android emulator where available | Launch, primary flows, navigation, screenshots, logs, crash/console checks for that runner | All displays, OEMs, real network conditions, physical sensors |
| Emulator/simulator integration | Each available platform target | Lifecycle, permissions, storage and navigation under simulated platform APIs | Full physical hardware/OEM behavior |
| Physical-device acceptance | Representative real devices only | Actual runtime behavior for the recorded device/build/provider | All devices or every OS version |

## Evidence and reporting rules

Every test run must record:

- Exact repository commit SHA and app/build version.
- Platform, OS version, CPU architecture, runtime/engine version.
- Test suite and scenario IDs, result, duration, and logs.
- Screenshots or video for GUI scenarios where relevant.
- Crash/console output and artifact links, with secrets and personal data redacted.
- Environment limitations and tests not run.

Use only these result labels: **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**, **NOT TESTED**. A suite passes only on the exact SHA it reports. A later commit requires new checks. No single green badge may collapse distinct platform evidence into a universal “all devices passed” claim.

Test fixtures must be synthetic. Do not upload real task contents, encryption keys, credentials, signing material, or private browser history into CI artifacts.

## Compatibility matrix labels

Use one status per platform/feature pair:

- **SUPPORTED** — product intends to support it and required implementation exists.
- **CI-TESTED** — build and specified automated tests pass on the documented runner.
- **DEVICE-TESTED** — a real device was tested and evidence records model, OS/API, engine/provider, build SHA, and scenarios.
- **EXPERIMENTAL** — prototype or partial implementation; limitations disclosed.
- **UNSUPPORTED** — not implemented or required guarantees cannot be met.

These labels are independent. For example, Linux may be CI-TESTED while remaining EXPERIMENTAL for production support until storage, packaging, update, accessibility, and security acceptance are complete.

## CI implementation sequence

1. Inventory current Android behavior and tests; pin the live base SHA and avoid overlapping edits to shared files.
2. Write an architecture decision record comparing a shared UI framework and browser engine using a small measurable prototype—not marketing claims.
3. Establish the shared core and fixture schema with no Android package, signer, encryption, or release changes.
4. Add Linux and Windows CI to run core tests and build the desktop proof of concept. Upload reproducible logs/screenshots.
5. Run the same core contract tests against Android adapters and retain existing Android source/build/release gates.
6. Add adapter-specific suites for storage, lifecycle, permissions, browser engine, downloads, and accessibility.
7. Evaluate OpenHarmony separately with a documented toolchain, actual build, and target runtime/device evidence.
8. Publish the compatibility matrix from CI artifacts and recorded device evidence, not from assumptions.

## Definition of “one test completes the test”

A single **shared-core test run** can complete the shared-core acceptance layer. A single **platform conformance suite** can complete the adapter layer for the platforms on which it actually ran. Neither completes physical-device acceptance for every platform.

The intended resource saving is to write scenarios once, reuse fixtures and assertions, execute them automatically across the matrix, and require manual device checks only for genuinely device-specific risks—not to skip those risks.

## Non-negotiable Daymark invariants

- Preserve Android application ID and namespace `com.abrar.daymark`.
- Preserve the production signer pin, signing secrets, monotonic versioning, and release gates.
- Keep task data local-first and encrypted at rest; migration/export must be explicit and tested.
- No analytics/ad SDKs and no task-content upload to CI or cloud services.
- Preserve HTTPS-only browsing, explicit online consent, and safe untrusted-page boundaries.
- Do not close browser blank-viewport issue #221 until its required runtime/device evidence is recorded.
- Do not merge a framework rewrite or browser-engine swap as part of the initial architecture documentation change.

## References

- Issue #325: https://github.com/AbrarulHaque8541/daymark/issues/325
- Flutter platform FAQ: https://docs.flutter.dev/resources/faq
- Tauri 2: https://tauri.app/
- OpenHarmony ArkTS overview: https://github.com/openharmony/docs/blob/master/en/application-dev/quick-start/arkts-get-started.md
- Mozilla GeckoView: https://mozilla.github.io/geckoview/

---

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools; repository policy/status review
Timestamp (UTC): 2026-10-22T18:00:00Z
