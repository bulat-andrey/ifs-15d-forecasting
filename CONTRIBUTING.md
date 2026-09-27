# Contributing

## Commit messages

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for every commit:

```text
<type>[optional scope]: <short description>
```

Use `fix` for bug fixes, `feat` for features, and a fitting type such as `docs`, `test`, `refactor`, or `chore` for other changes. Keep the description concise and in the imperative mood. Add `!` after the type or scope and explain the change in a `BREAKING CHANGE:` footer for breaking changes.

Examples:

```text
fix: correct spot camera links and live source cards
docs: document commit message convention
```

If a pull request will be squash merged, use the same format for its title so the resulting commit follows the convention.
