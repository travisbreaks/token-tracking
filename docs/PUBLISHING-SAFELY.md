# Publishing usage data safely

Your AI usage logs describe your work: client names in paths, a schedule in the timestamps,
accounts in tool names. This repo publishes aggregates from them. Here is the pipeline, and
the specific things that nearly leaked while it was built, so you can skip finding them the
hard way.

## The pipeline

1. **Private data never enters Git.** The collector writes to `data/private/` and reads
   machine-specific settings (project roots, aliases, the category map, extra terms to block)
   from `tracking.local.json`. Both are gitignored, as are hidden top-level folders and the
   local review folder.
2. **An allowlist contract, not a denylist.** `scripts/public-contract.ts` names every field
   the public file may hold, and the keys of every map (categories, model IDs, tool names).
   The validator rejects anything else. `scripts/publish.ts` builds the public object field
   by field; nothing is copied wholesale, so a new private field cannot ride along.
3. **Generalize what you cannot allowlist.** Model IDs not on a provider's public pricing page
   publish as `claude-other` / `openai-other`. Every MCP tool publishes as `MCP`. Projects
   publish only as categories, and the publish step refuses to run while any project has no
   category.
4. **A leak gate on the exact commit.** `npm run check-public` scans, and the pre-commit hook
   runs it on the Git index itself (`--staged`), so it checks the bytes being committed:
   - the published file against the contract;
   - patterns: session IDs (UUIDs and `agent-<hex>`), home and volume paths, MCP tool names,
     email addresses;
   - every real project name, alias, root and extra term from the private files, in every
     file, in every file and folder name, in binaries read as bytes, with separator variants
     and a separator-blind pass (so `acme-portal` also matches `acme_portal` and
     `acmePortal`);
   - image metadata, including PNG text chunks;
   - gitleaks.

   The name list is the secret, so CI cannot run that part; CI runs everything else. A green
   CI run is not privacy approval on its own.
5. **A commit-message check.** The file gate never sees commit messages or identities, and
   both become public with the repo. The `commit-msg` hook scans the message (ignoring the diff
   under a `git commit -v` scissors line) and the author and committer, requires GitHub noreply
   emails for both, and allows the display name itself, which is public in every commit.
6. **Build in CI from a clean checkout.** The site is built by GitHub Actions, where private
   files do not exist. The Mac never uploads a build.
7. **Verify the live site is the reviewed build.** `npm run check-live` crawls the deployed
   site, requires every file to be byte-identical to the local build, and reruns the leak
   checks on the live bytes. A valid but stale site would otherwise pass.

## What nearly leaked

Each of these passed at least one earlier check.

| Found | Where | Fix |
|---|---|---|
| A color map keyed by brand names listed every paid subscription | a ported source file, not data | colors derived from a hash of the name |
| The image's capture time and time-zone offset | EXIF in the one PNG | metadata stripped; the gate fails on any |
| The personal email | Git author on every commit, from the global Git config | repo-local noreply email; the commit-msg hook enforces it |
| Private names in a staged file that differed from the working copy | the gate read the working file | the gate reads the Git index |
| Internal model IDs from private logs | a pricing comment and a test | generic IDs; an allowlist of published models |
| A hardcoded time zone and the account's weekly reset slot | source code | local time; the slot removed |
| All of the above in older commits | Git history | squashed to one commit before the first push |
| The full private data file | the local dev server, which serves any file under the repo root by URL | a guard that refuses private paths, see below |
| A client's engagement over time | a per-day category series (no name, but readable by anyone who knows the client) | categories are published by month; days carry no category split |

### Monthly categories are not protection against snapshot differencing

A monthly row removes the explicit daily category series. It does not make repeated
publications anonymous: comparing a month's totals, or all-time category totals, between
two releases can reveal what changed in that interval. Treat the first public dataset as a
fixed snapshot. No automatic data refresh is enabled. Review the disclosure before publishing
another snapshot; use closed reporting periods if finer activity timing must stay private.

The same rule applies to Git history. A newer sanitized file does not remove older versions.
Before making a previously private repository public, inspect every reachable version and
ref. A release whose earlier history contains daily categories needs clean public history,
not just another commit. Preserve a private backup and obtain approval before rewriting a
remote branch. History rewrites alone do not guarantee removal from hosting caches.

### The local dev server serves everything

Vite's dev server serves any file under the project root by URL, gitignored or not, in several
forms: the plain path, `?import`, `/@fs/<absolute path>`, percent-encoded paths, and `../`
traversal. On macOS the file system is case-insensitive, so `/Data/Private/usage.json` is the
same file as `/data/private/usage.json`. A lowercase-only guard served the whole private file
under the capitalized path. Also:

- `server.fs.deny` patterns are matched against absolute paths, so `data/private/**` never
  matches; write `**/data/private/**`.
- Denying every hidden folder (`**/.*/**`) also blocks `node_modules/.vite/deps` and breaks
  the app. Deny the specific folders.
- Set `cors: false`. The default grants CORS to other localhost origins, which lets any other
  local web page read what the server returns.

`scripts/dev-guard.ts` normalizes the path, compares it case-insensitively, and refuses private
paths before Vite sees the request. `scripts/__tests__/release-guards.test.ts` lists the
variants it must refuse.

### String scanning has blind spots

- **Short and common names.** A 2-letter project name matches random letter pairs in build
  hashes (`...-Xy.js`). A project named after an English word matches ordinary text. The
  gate tiers names: dictionary words are checked as exact published values and in prose;
  short names are skipped in minified bundles, binaries and the file list, where letter runs
  are noise.
- **Inflections.** The system word list has base forms only. Without stemming, "lanterns"
  looks distinctive; with naive stemming, an invented name ending in "-ings" looks generic.
  Stems count only at 5 characters or more.
- **Variants.** `acme-portal`, `acme_portal`, `acmePortal` and `acme portal` are the same leak.
- **Places that are not file contents.** File and folder names, binary files, image text
  chunks, commit messages, author identity.
- **Encodings.** Base64, hex or a name split across lines defeat any string match. The gate
  does not try; only the author commits here, and the check is against accidents, not intent.
- **Names that are public on purpose.** The repo's own name and its GitHub owner are exempt
  automatically. A project that is itself public and linked from here goes in a reviewed local
  `publicNames` list. Never use it to silence a private project.

### A clean scan proves nothing without a positive control

Every check in this repo was proven by planting a real private name (or path, or ID) and
watching it fail, then removing the plant and watching it pass. A scanner that finds nothing
may simply not be looking. Plants that worked, one at a time, with `NAME` a real private
project name:

```bash
mkdir ctl-NAME && echo safe > ctl-NAME/x.md          # a name as a folder name
printf '\x00 NAME \x02' > public/ctl.woff2         # a name inside a binary
cp public/lobster.png public/ctl.png && exiftool -overwrite_original -PNG:Comment=x public/ctl.png
echo 'see NA_ME notes' > ctl.md                      # a separator inserted (use the real split)
printf 'fix: NAME\n' > msg.txt && npm run --silent check-message -- msg.txt
```

Each must fail `npm run check-public` (or the message check); move the plant out and it must
pass again. Run a second copy of the gate in a throwaway clone only with a real
`data/private/usage.json` and `tracking.local.json`; without them the name checks report
`names: SKIPPED`, which is not a pass.

### What becomes public with the repo

Not just the files: every commit (message, author, date), every Actions run log, the repo
description, and whatever the wiki allows. Squash history before the first push, keep CI logs
free of private data (CI never has it here), and turn off the wiki unless you use it, since a
public wiki can be editable by anyone.

## Review

Automated checks were paired with independent reviews at each stage: the plan, the first
build, a release review by an assistant from a different model vendor, and a pre-publication
review. Each round was told to verify claims by running commands rather than endorse them,
and each found something the previous ones missed: the staged-file bypass, the date-bucket
mismatch, the dev-server file serving, the case-insensitive path, file names and binaries,
commit metadata. The lesson generalizes: a second reviewer with a different starting point
finds different bugs, and "the tests pass" is not a review.
