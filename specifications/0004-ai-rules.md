# 0004 — AI Rules & Contributing

**Status:** Implemented | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

This spec defines the rules that AI agents (and human contributors) must
follow when modifying the deashot codebase. It exists to keep the project
consistent, spec-driven, and easy to verify.

## Rules

### 1. Spec-first

Every code change must reference a specification in `specifications/`.

- **Before writing code:** locate the relevant spec (use `specifications/README.md` index).
- **If no spec exists yet:** write one as `Proposed` (use `NNNN-<slug>.md`). Get it `Accepted` before merging.
- **When implementing:** all acceptance criteria in the spec must be satisfied.
- **On merge:** mark the spec `Implemented` and bump its version + add a changelog entry.

### 2. Branches

- Work on `main` is protected. All changes go through a feature branch and PR.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `perf/` followed by a short slug.
- Each PLAN.md phase maps to exactly one feature branch. The phase merges to `main` when its gate passes.

### 3. CI must pass

PRs cannot be merged until all of the following pass:
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:unit`
- `pnpm test:integration`

### 4. Tests are mandatory for behavioural changes

- Any change to game rules, protocol, or player-facing behaviour requires a new or updated test.
- Unit tests live alongside source in `*.test.ts` files.
- Integration tests run the full Colyseus two-client join flow.

### 5. Commit convention

- Semantic prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `perf:`.
- One logical change per commit.
- PR descriptions must reference the related spec(s).

### 6. Code style

- TypeScript strict mode everywhere. No `any` without documented justification.
- Functional React components only (no class components).
- Three.js: `Euler(..., "YXZ")` order for FPS cameras. Forward = `(-sin(yaw), -cos(yaw))`.
- No external assets or placeholder URLs in committed code (MVP = geometric primitives only).

### 7. Security

- Never commit secrets, API keys, or tokens.
- `.env` is gitignored; `.env.example` is the template.
- Auth tokens (Colyseus, JWT) are set via environment variables only.

### 8. Specifications themselves

- Specs follow the naming convention `NNNN-<slug>.md`.
- Specs progress: `Proposed` → `Accepted` → `Implemented` → (optionally) `Changed`.
- Every update to an implemented spec bumps its version and adds a changelog entry at the bottom.

---

**Changelog**

- v1.0 — Initial spec (Phase 0 + 1 contributing rules)