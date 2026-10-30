import type { BookWithCover } from "./domain";
import { editableBook, sameManuscript } from "./draft-storage";

/** In-memory undo is independent of cloud revisions and keeps media owned by the server. */
export class DraftHistory {
  private past: ReturnType<typeof editableBook>[] = [];
  private future: ReturnType<typeof editableBook>[] = [];
  private lastTyping = 0;
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  record(before: BookWithCover, after: BookWithCover, typing = false, now = Date.now()) {
    if (sameManuscript(before, after)) return;
    if (!typing || now - this.lastTyping > 900 || !this.past.length) {
      this.past.push(structuredClone(editableBook(before)));
      if (this.past.length > 60) this.past.shift();
    }
    this.lastTyping = typing ? now : 0;
    this.future = [];
  }
  undo(current: BookWithCover): BookWithCover | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(structuredClone(editableBook(current)));
    this.lastTyping = 0;
    return { ...current, ...previous, revision: current.revision };
  }
  redo(current: BookWithCover): BookWithCover | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(structuredClone(editableBook(current)));
    this.lastTyping = 0;
    return { ...current, ...next, revision: current.revision };
  }
  clear() { this.past = []; this.future = []; this.lastTyping = 0; }
}
