import { readFileSync, writeFileSync } from "node:fs";

const target = "src/components/editor.tsx";
let source = readFileSync(target, "utf8");
const marker = 'import { StudioPlanTools } from "./studio-plan-tools";';
if (source.includes(marker)) {
  console.log("Studio plan tools already integrated.");
  process.exit(0);
}
const importNeedle = 'import { BookCover, BookBackCover } from "./book-cover";';
if (!source.includes(importNeedle)) {
  throw new Error("Studio editor imports unexpectedly changed; refusing to modify source.");
}
source = source.replace(importNeedle, importNeedle + "\n" + marker);
const needle = 'chapter-flow-list is-workspace';
const where = source.indexOf(needle);
if (where < 0 || source.indexOf(needle, where + needle.length) >= 0) {
  throw new Error("Studio chapter list anchor absent or ambiguous; refusing to modify source.");
}
const insertionAt = source.lastIndexOf("<div className=", where);
if (insertionAt < 0 || where - insertionAt > 110) {
  throw new Error("Studio chapter list declaration unexpectedly changed; refusing to modify source.");
}
const markup = `{!chapterWorkspaceOpen && <StudioPlanTools
                book={draft} locale={locale} disabled={disabled || saving}
                canGenerateAll={config.ai && book.unlocked}
                onIdeaChange={idea => change(b => ({...b, idea}), true)}
                onChapterSummaryChange={(target, summary) => change(b => ({
                  ...b, outline: b.outline.map(item => item.id === target ? {...item, summary} : item)
                }), true)}
                onChapterOpen={id => void openChapterWorkspace(id)}
                onGenerateRemaining={() => void generate("book")}
                onReplan={() => void restartManuscript()}
              />}
              `;
source = source.slice(0, insertionAt) + markup + source.slice(insertionAt);
writeFileSync(target, source, "utf8");
console.log("Production-source studio outline tools patched successfully.");
