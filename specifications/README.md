# specifications

All code changes in this project must follow a specification in this folder and update the
relevant spec in the same PR when the change alters behaviour, interfaces, or protocols.

## Lifecycle

Specs move through four states:

| State | Meaning |
|---|---|
| **Proposed** | Draft under discussion; not yet approved |
| **Accepted** | Approved and ready for implementation |
| **Implemented** | Merged and live on `main` |
| **Changed** | An implemented spec that was updated after initial merge |

Every change to an implemented spec must bump its version (v1 → v2, etc.) and add a changelog
entry at the bottom of the file.

## How to use

1. **Before coding:** find the spec that governs your change (use the index below).
2. **If none exists:** write one as `Proposed`, get it `Accepted` before merging code.
3. **When implementing:** ensure all acceptance criteria in the spec are met.
4. **When done:** mark the spec `Implemented` in the same PR, bump version, add changelog.
5. **PRs:** link to the relevant spec(s) in the PR description.

## Naming convention

Specs are numbered sequentially: `NNNN-<short-slug>.md` (e.g. `0001-tdm-rules.md`).

## Index

| # | Spec | Status |
|---|---|---|
| 0001 | [Game Design](./0001-game-design.md) | Implemented |
| 0002 | [Architecture](./0002-architecture.md) | Implemented |
| 0003 | [Networking Protocol](./0003-networking-protocol.md) | Implemented |
| 0004 | [AI Rules & Contributing](./0004-ai-rules.md) | Implemented |
| 0005 | [Combat](./0005-combat.md) | Implemented |
| 0006 | [Team Deathmatch](./0006-team-deathmatch.md) | Implemented |
| 0007 | [Lobby & Match Flow](./0007-lobby-match-flow.md) | Implemented |