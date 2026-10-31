# Studio book-map enhancements, recovered from live Vercel source

## Status

- **Live website remains unchanged:** `dpl_5jbMwiLvwgFydwXCUE8fnUeeJZcT`
- **Successful isolated Preview:** `dpl_G5mJRdYGYbcR3e5FwVajfQFvarQR` (READY)
- Preview URL: https://ebookstartawebb-fwx7pg5ry-riadh-massaoudi-s-projects.vercel.app
- Complete source file reference list: [vercel-preview-source-manifest.json](./vercel-preview-source-manifest.json), 138 files.
- GitHub default branch is NOT the live source and must not be deployed to replace production.

## What the Preview implements

Adds a compact, collapsible book overview **within the existing authoring screen** without replacing the editor:
- Book-wide planned-content summary, derived from existing AI-written chapter plan summaries.
- Editable original idea and editable per-chapter summaries using existing draft autosave, unchanged data model.
- Chapter-by-chapter navigation and a clearly labeled option to generate unwritten chapters automatically, using the existing authorized AI generation job.
- A clearly labeled archive-and-replan route reusing existing version history, with an explicit warning that it resets the active manuscript and covers.
- Existing chapter-regeneration controls and all original editor functionality remain in place.

**Not yet implemented:** a standalone, non-destructive AI proposal/retry mechanism for different ideas or outlines. The server currently refuses to generate an outline when one exists, so this work deliberately does not advertise such a button. The existing archive/restart path lets users try another AI-generated outline after preserving a version, but it is not equivalent to reviewing AI alternatives before replacing anything.

## Reproduction

The Preview was created using exactly the files referenced in the manifest, with these changes:

- Added component `src/components/studio-plan-tools.tsx` from this folder
- Added `src/components/studio-plan-tools.module.css` from this folder
- Added build script `scripts/patch-editor.mjs` from this folder
- Updated package.json build script to:
  `node scripts/patch-editor.mjs && next build --webpack`

The script validates the expected production editor signature and **fails the build without writing the editor** if the signature is not as expected. It adds the new component only into the current chapter-list area. This build-time patch is a TEMPORARY recovery bridge because the deployed, improved ~180 KB editor source was not available through the GitHub repository. The permanent solution is to recover ALL live-source files from Vercel and integrate the component into source code normally before merging.

## Required checks before promoting a release

- Verify authenticated full workflow: idea -> outline -> summary editing -> one chapter / remaining chapters -> edit image -> save/reopen -> export.
- Confirm mobile/responsive experience and local/cloud save state.
- Check text-edit AI, chapter regeneration, document cover, and previous versions.
- Confirm production environment variables and app origin for new deployment.
- Use a staged production deployment and promote only after validation. Do not merge this branch into GitHub `main` as-is.

### Safety

Source reference SHA1s are **not** encrypted passwords or Firebase secrets, but do not publish secret env files or user data. Do not deploy a Git checkout of the stale default branch.
