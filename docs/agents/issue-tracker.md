# Issue tracker: Gitea

Issues and specs for this repo live as Gitea issues on `git.arthurerlich.de`. Use the `tea` CLI for all operations (see the `gitea-tea` skill).

## Conventions

- **Create an issue**: `tea issues create --title "..." --description "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `tea issues <number>` (shows comments with `--comments`).
- **List issues**: `tea issues list --state open --fields index,title,body,labels` with `--labels` filters as needed.
- **Comment on an issue**: `tea comment <number> "..."`
- **Apply / remove labels**: `tea issues edit <number> --add-labels "..."` / `--remove-labels "..."`
- **Close**: `tea issues close <number>` (add a comment first with `tea comment`).

Infer the repo from `git remote -v` — `tea` does this automatically when run inside a clone with a configured login. Run `tea --help` / `tea issues --help` if a flag differs in your installed version.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests.)_

## When a skill says "publish to the issue tracker"

Create a Gitea issue.

## When a skill says "fetch the relevant ticket"

Run `tea issues <number>` with comments.
