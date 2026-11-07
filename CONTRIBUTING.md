# Contributing to Celpare

## Commit messages

Every commit and every pull request title starts with a type. Releases are
versioned from these automatically, so the type is what decides the next
version number.

```
<type>(<optional scope>): <plain sentence>

<why the change was made, wrapped at about 80 characters>
```

| Type | Use it for | Next release |
|---|---|---|
| `feat` | Something people can now do | minor, 0.2.0 to 0.3.0 |
| `fix` | Something that was wrong and now works | patch, 0.2.0 to 0.2.1 |
| `perf` | Faster, same behaviour | patch |
| `revert` | Undoing an earlier commit | patch |
| `docs`, `refactor`, `test`, `build`, `ci`, `style`, `chore` | No change for people using Celpare | none |

A breaking change adds `!` after the type, `feat!: ...`, or a
`BREAKING CHANGE: ...` line in the body.

Examples:

```
feat(onboarding): Let people edit their interests
fix(ask): Keep numbered lists numbered across blank lines
ci: Pin every action to a commit SHA
```

Two more rules, checked by the `commit-msg` hook and in CI:

- No em dashes. Use a comma, a colon or a period.
- No `Co-Authored-By` trailers.

The hooks live in `.githooks`. Turn them on once per clone:

```
git config core.hooksPath .githooks
```

## Releases

`release-please` keeps one open Release PR with the next version and its
changelog. Merging it tags `vX.Y.Z` and publishes the GitHub Release.
