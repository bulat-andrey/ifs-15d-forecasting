# Repository instructions

Follow the commit message convention in [CONTRIBUTING.md](CONTRIBUTING.md) when creating commits. Use the same format for pull request titles intended for squash merge.

Follow the local development, review, and deployment workflow in
[docs/development.md](docs/development.md). Develop and test on a laptop,
including with a real phone over private Wi-Fi; keep the VM for production.
Deploy only a clean, merged `master` checkout through `deploy/deploy.sh`.

## Application versioning and releases

Keep the user-facing application version in sync with the `version` field in
`package.json`, using semantic versioning. Use `MAJOR.MINOR.PATCH`: increment
the minor version for a user-visible feature, the patch version for a small
fix, and the major version only for a breaking change or stable public release
milestone.

Every user-visible release must update the in-app **What's new** entry with a
short, plain-language list of changes. Show the current version in the user
settings panel. Keep release notes focused on changes users can see or act on;
do not list internal refactors unless they affect behavior.

For GitHub, use Conventional Commit titles for PRs and squash-merge feature
work into `master`. Create an annotated tag and GitHub Release only for a
versioned production release, after the PR is merged and production health is
verified. Do not tag ordinary feature branches or unmerged PRs. Release tags
must use the `vMAJOR.MINOR.PATCH` format and point to the deployed `master`
commit.
