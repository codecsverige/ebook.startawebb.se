# Production-based document settings hotfix (2026-10-31)

**Do not merge or deploy this GitHub branch as the production source.**

The source of the current live site was deployed directly to Vercel and has files that are not present in the current GitHub `main` branch. This recovery branch is a non-destructive archive of an isolated change and its content-addressed source manifest, not a complete runnable checkout.

## What was tested

- Live deployment remains `dpl_5jbMwiLvwgFydwXCUE8fnUeeJZcT` (`ebook.startawebb.se`)
- Exact 134-file source copy: `dpl_6ZUdeVH53TFRfCMsXCFRzMGCEcDg` (READY; Preview)
- Hotfix preview: `dpl_8YdXBxZdWLjB1z2N1pU9eBE1Mhhg` (READY; Preview only)
- Hotfix edits `src/lib/document-options.ts`: reject invalid imported document types, paper sizes and nonboolean flags while preserving valid explicit choices, including hidden front/back covers.
- Adds `tests/document-options-validation.test.ts` covering valid preferences, defaults, and imported invalid values. The READY preview confirms the Vercel build completed; it does not itself establish that the Node test suite ran.

## Source preservation

The `preview-source-manifest.json` stores 135 source-file IDs for the exact hotfix Preview, including the original live-only source. `document-options.ts.txt` and `document-options-validation.test.ts.txt` contain complete text copies of the only two added/modified files. They use `.txt` because this GitHub branch's older app source lacks the live-only data model. Placing them into the GitHub app directly would create a broken or old deployment.

To synchronize the live source properly, fetch **all** file contents from the Vercel deployment by these IDs using an authorized account, place them at their listed paths, then compare manifests and run the full tests before replacing GitHub main.

**Never push the old GitHub checkout to production, never promote its automatic preview and never send Vercel/GitHub tokens to chat.**
