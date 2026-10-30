# Technology-agnostic engineering policy

**Owner direction:** Daymark may use any programming language, runtime, framework, compiler, build system, library, or tool when it is the best justified choice for the specific job. The languages named below are examples only, not an allowlist, ranking, mandate, or limit. If a different or newly emerging technology is demonstrably better, agents may evaluate and propose it.

## The outcome is the requirement

Choose technology to deliver the best overall Daymark result: fast, efficient, secure, reliable, private, accessible, battery-conscious, storage-conscious, maintainable, testable, and compatible with supported Android devices and future development. Do not choose a language because it is fashionable, familiar, or mentioned in a document. Do not avoid a good technology merely because it is not currently in the repository.

Examples (non-exhaustive; never restrictive):
- Java / Kotlin for Android platform integration, UI, lifecycle, services, and APIs where they fit.
- C / C++ for proven CPU-bound native workloads or mature native libraries.
- Rust or another memory-safe systems language for suitable parsing, isolation, or performance-sensitive components.
- Python, Go, Ruby, shell, or other languages for developer tooling, automation, test harnesses, build/release support, or services where appropriate.
- JavaScript / TypeScript, WebAssembly, or other web technologies for browser-facing or web-based components.
- SQL and other query/data languages for storage and data processing.
- Any other language, including one not listed here, when evidence supports it.

These are examples, not an instruction to add all of them. A multi-language implementation is welcome when its benefits outweigh the added build, ABI, runtime, dependency, debugging, security, licensing, and maintenance costs. A single-language solution is equally welcome when it is the best engineering choice.

## Decision and implementation standard

1. **Start from the workload.** Define the user-visible requirement, constraints, supported API/device/ABI matrix, data sensitivity, expected inputs, and failure modes.
2. **Inspect before replacing.** Understand current source, tests, data formats, platform boundaries, open PR ownership, and release constraints. Prefer incremental modules/adapters over a rewrite.
3. **Measure real candidates.** For performance-sensitive work, benchmark representative workloads against the current implementation using equivalent inputs and release-like builds. Record methodology, device/OS, compiler/runtime versions, warm/cold behavior, sample counts, variance, p50/p95 latency, throughput, CPU, memory/allocations, battery/thermal behavior, startup impact, and APK/download size as relevant. Do not claim a speedup without reproducible evidence.
4. **Evaluate total cost.** Consider correctness, security, memory safety, ecosystem maturity, dependency health, licensing, portability, ABI coverage, build reproducibility, CI support, observability, accessibility, cancellation, lifecycle behavior, team/tooling capability, and long-term maintenance—not raw speed alone.
5. **Prototype and compare.** A small isolated prototype or spike is preferred before a high-risk rewrite. Keep the existing implementation as a fallback until the candidate has passed parity, security, performance, and compatibility gates.
6. **Adopt only when it wins.** Document why the selected option is better for this component and why reasonable alternatives were rejected. If results are inconclusive, keep the simpler proven implementation and gather better evidence.
7. **Keep boundaries explicit.** Define stable typed interfaces, versioning, ownership, error mapping, cancellation, resource limits, and data contracts across language/runtime boundaries. JNI/FFI/native code must validate inputs and handle memory ownership and exceptions safely.
8. **Test adversarially.** Include malformed/oversized input, fuzz/property tests where appropriate, regression and differential tests, interruption/process-death/recovery, concurrency, device/API/ABI coverage, and fallback behavior.
9. **Keep the app lean.** Avoid bundling interpreters, runtimes, native libraries, ABIs, model assets, or frameworks without a demonstrated product need. No optional payload may silently consume user storage or download in the background.
10. **Record evidence honestly.** Separate source inspection, host tests, unit/instrumentation tests, Android CI, benchmark results, emulator tests, physical-device tests, and release qualification. Mark unrun work NOT RUN / NOT TESTED.

## Non-negotiable repository invariants

Technology freedom does not grant permission to change product or release invariants:
- Preserve the owner-approved application ID and namespace `com.abrar.daymark`, production signer pin and existing signing secrets, monotonic versioning, and established release process. No signer/package identity change without explicit owner approval.
- Preserve user tasks, attachments, encrypted storage, backup formats, migrations, and existing features. No silent destructive migration or data reset. Maintain backward compatibility or provide a reviewed, tested migration and recovery path.
- Preserve local-first/privacy boundaries, no analytics/ad SDKs, explicit user consent for network activity, HTTPS-only updater and non-browser network clients, and the existing browser policy documented in `AGENTS.md`.
- Do not introduce custom cryptography. Prefer established, audited platform or well-maintained cryptographic implementations and preserve existing key-management boundaries.
- Do not add broad JavaScript/native bridges, arbitrary downloaded executable code, unbounded shell access, hidden background work, or permission/policy bypasses.
- Keep Android System WebView platform-managed; a native wrapper or alternate language does not replace Chromium/WebView or magically accelerate page rendering.
- Do not merge, tag, publish, bump versions, or alter production signing/release state without the required owner authorization.
- Coordinate shared-file ownership and follow all rules in root `AGENTS.md`; those rules take precedence where they are stricter.

## Required proposal/PR evidence for a new language or runtime

For a meaningful new language/runtime/native component, include:
- The exact component and user problem it solves.
- Why the existing implementation is insufficient.
- Candidate comparison and why this choice wins.
- Measured benchmark methodology/results when performance is claimed.
- Security/threat-model and dependency/license review.
- Build/CI/toolchain and supported API/ABI/device impact.
- APK/install/storage/RAM/battery/thermal impact.
- Interface, data-format, compatibility, rollback/fallback, and migration strategy.
- Tests actually run, exact commit SHA, and what remains NOT TESTED.

A new language is not a goal by itself. **Best outcome wins; no language is forbidden by default, and no language is automatically approved without engineering evidence.**
