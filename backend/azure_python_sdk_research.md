# Azure Python SDK Research Notes (for PrivateAI backend test improvements)

Date: 2026-04-16

Sources reviewed:
- Microsoft Learn: https://learn.microsoft.com/en-au/azure/developer/python/sdk/azure-sdk-overview
- Microsoft Learn (authentication): https://learn.microsoft.com/en-au/azure/developer/python/sdk/authentication/overview
- Azure SDK for Python repo: https://github.com/Azure/azure-sdk-for-python
- Repo docs:
  - `README.md`
  - `CONTRIBUTING.md`
  - `doc/python_version_support_policy.md`
  - `doc/sphinx/mgmt_quickstart.rst`

---

## 1) Key SDK concepts relevant to this codebase

## Management-plane vs data-plane
- Azure Python SDK has distinct package families:
  - **Management-plane** packages (`azure-mgmt-*`) for provisioning/managing Azure resources.
  - **Data-plane/client** packages for using already-provisioned resources.
- PrivateAI backend provisioning tests are primarily management-plane heavy (`azure-mgmt-resource`, `azure-mgmt-network`, `azure-mgmt-compute`), plus SSH/http runtime checks.

## Package model
- The SDK is not one monolithic package; it is a large set of service-specific libraries.
- Correct package-specific dependency pinning is important in tests (avoid assuming generic `azure` package behavior).

## Core shared behavior
- New-generation packages align to shared SDK guidelines (auth, HTTP pipeline, retries, error behavior, tracing).
- This matters for test design: we should test behavior contracts (success/failure/result states), not brittle internal details.

---

## 2) Authentication guidance and implications

Microsoft Learn recommends **token-based auth via Microsoft Entra ID** over connection strings/keys.

## Recommended credentials by environment
- **Azure-hosted apps:** managed identity (system/user assigned).
- **Local dev/test:** developer credentials (CLI/VS Code), broker, or service principal.
- **On-prem:** service principal (or Arc managed identity when available).

## For this repo
- Our tests currently rely on SP env vars:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
- This is aligned with Azure docs and `mgmt_quickstart.rst` examples.
- We should keep preflight checks explicit and fail fast with actionable messages when these are missing.

---

## 3) Long-running operation (LRO) patterns

From Azure management SDK usage patterns and quickstart docs:
- Create/delete operations commonly use `begin_*` methods returning pollers.
- Correct pattern is to wait on poller completion (`.result()` or `.wait()`).

## For this repo
- Cleanup reliability must account for LRO behavior: if tests fail mid-run, teardown should still execute and wait for delete completion where appropriate.
- Test fixtures should use `try/finally` to always attempt `destroy()`.

---

## 4) Python/version and dependency policy learnings

From repo policy docs:
- SDK has explicit Python support windows and retirement timelines.
- New feature support is tied to supported Python versions.

## For this repo
- We target Python 3.12 (`pyproject.toml`), which is within support.
- Test scripts should provide clear preflight dependency checks to avoid noisy import-failure cascades.

---

## 5) Testing/tooling conventions from Azure SDK repo

From `CONTRIBUTING.md`:
- Azure SDK team emphasizes reproducible checks and one-command tooling (`azpysdk` in their repo).
- They encourage isolated runs and explicit lint/type/test checks.

## For this repo
- We should mirror this with a **single command/script** for cheap VPS fast-path testing.
- This reduces operator error and matches the user’s “copy/paste and evaluate output quickly” objective.

---

## 6) Concrete design decisions derived from this research

1. Add teardown-safe fixture patterns (`try/finally`) across live phase3 tests.
2. Avoid fixed-name RG/VM collisions in cheap live tests by using unique generated names.
3. Add robust cleanup for dynamically named test RGs based on tags/prefixes.
4. Reduce redundant remote validation calls by computing once per module fixture.
5. Harden NSG source-prefix assertions for SDK shape variants (`source_address_prefix` vs `source_address_prefixes`).
6. Improve preflight dependency clarity in phase1 lint tests.
7. Add one-command fast phase3 script with automatic teardown behavior.

---

## 7) Caveats and constraints

- Live Azure tests remain integration tests and can still fail for transient cloud reasons (capacity, API throttling, region-specific issues).
- We should keep tests deterministic where possible but preserve strict teardown guarantees to limit cost risk.
- Any “bulk cleanup” logic should be prefix/tag constrained to avoid accidental deletion of non-test resources.
