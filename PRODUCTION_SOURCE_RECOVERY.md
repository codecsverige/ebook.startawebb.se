# Ebook Studio production recovery (2026-10-31)

> DO NOT DEPLOY THIS BRANCH AS PRODUCTION. It is a pre-revert GitHub safety baseline, **not** a complete copy of the currently live source code.

## Deployment references

- Live production deployment (READY): `dpl_5jbMwiLvwgFydwXCUE8fnUeeJZcT`
- Separate backup redeployment from the exact live deployment (READY): `dpl_4DNdggcKTe1xTwsRFcdFTBrmnGv7`
- Project: `ebook.startawebb.se` (`prj_z01a5XQEnxWFNQCQ7eYWnCCJhvfH`)
- Current branch base: `96fea2547cc773b151b97f9084d7471712dd57a4` (last pre-revert GitHub version)
- Known later revert: `65f672781f7cddff52dc6cd6413c6e0b81ff7dce`

## Source parity gap

The live deployment was created by `vercel deploy`, not a GitHub commit. Its file tree has 134 source files and includes components not present in GitHub at the last pre-revert commit, such as:

- `src/components/page-chapter-editor.tsx`
- `src/components/ai-activity.tsx`
- `src/components/document-settings.tsx`
- `src/lib/book-pages.ts`
- `src/lib/document-options.ts`

Other live files have additional changes. A deployment from existing GitHub code **can remove these improvements**. Do not deploy, force-push, merge, or automatically restore from GitHub until source parity is established.

## Safe recovery checklist

1. Retrieve all source files from the original live deployment via authorized Vercel source-file API (a local token-based downloader may be needed). Do not commit tokens or environment secrets.
2. Verify the recovered file manifest and hashes. Preserve the exact source in a new GitHub branch.
3. Compare against this baseline and the GitHub `main` branch, keeping all live UI, editing, AI, and document/export behavior.
4. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`, plus manual book editing, image placement, save/reload, AI, and export checks.
5. Only after a successful preview based on the *recovered* live source, deliberately move changes to production.

No live code or domain aliases were changed as part of this recovery note.
