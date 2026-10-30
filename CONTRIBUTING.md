# Contributing to Daymark

Thank you for your interest in improving Daymark! Whether you are reporting a bug, proposing a new feature, or submitting code, your contributions are welcome.

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Core Principles

1. **Data integrity:** Treat preserving user tasks and attachment data as a design priority. Document failure boundaries, test interrupted writes/migrations and recovery paths, and never promise that all data loss or corruption is impossible.
2. **Offline-first and privacy-conscious:** Keep core task operations designed for local/offline use without mandatory third-party accounts; distinguish this from optional browser or updater network activity and verify offline behavior on supported devices.
3. **Strict Integrity:** Any remote feature (such as the in-app updater) must cryptographically verify downloads against expected hashes before prompting the user.

## Pull Request Guidelines

1. Fork the repo and create your branch from `main`.
2. Ensure any new features include unit/smoke tests under `android-app/tools/`.
3. Verify that changes run cleanly against the test suite (`npm test` for web, `sh android-app/tools/run-core-tests.sh` for Android).
4. Clearly state what problem your PR solves and verify backward compatibility.

## Language, frameworks, and tools

Daymark is **technology-agnostic**. Contributors and coding agents may use any programming language, runtime, framework, compiler, build system, or tool when it is the best fit for the component. Languages mentioned in examples (including Java, Kotlin, C/C++, Rust, Python, JavaScript/TypeScript, Go, and SQL) are illustrative only; the list is not exhaustive, and none is mandatory. Choose based on measured performance where relevant, correctness, security, privacy, reliability, supported-device compatibility, build/ABI/runtime footprint, licensing, and long-term maintenance. Do not add technologies for novelty or rewrite working code without evidence. See [Technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md) for the required decision, benchmark, security, fallback, and PR evidence.

