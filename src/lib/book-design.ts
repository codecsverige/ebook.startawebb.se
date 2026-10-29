import {
  bookSettings,
  type Book,
  type BookSettings,
  type CoverStyle,
} from "./domain";
import { escapeHtml as esc, markdownHtml } from "./export-text";

export const palettes: Record<
  CoverStyle,
  { bg: string; ink: string; accent: string }
> = {
  cobalt: { bg: "#3159df", ink: "#fffdf6", accent: "#a7bcff" },
  sage: { bg: "#d8decd", ink: "#293e34", accent: "#879978" },
  clay: { bg: "#e6bba1", ink: "#5b342a", accent: "#c17b58" },
  midnight: { bg: "#17243f", ink: "#fff8eb", accent: "#9cbbef" },
  plum: { bg: "#603b68", ink: "#fff7ef", accent: "#cda7d4" },
  ivory: { bg: "#f5eddf", ink: "#322b29", accent: "#b99573" },
  forest: { bg: "#123d35", ink: "#f5ecda", accent: "#b8d2ac" },
  ember: { bg: "#613123", ink: "#fff0db", accent: "#eaa36c" },
  lagoon: { bg: "#076c75", ink: "#eaf8f4", accent: "#8bd4c6" },
  rose: { bg: "#f4dce3", ink: "#552b40", accent: "#c57c95" },
  noir: { bg: "#10141e", ink: "#f9f1e6", accent: "#c5a78a" },
  sky: { bg: "#8dc9e7", ink: "#16354f", accent: "#f9e1a0" },
  gold: { bg: "#d5b76c", ink: "#302619", accent: "#f9eed1" },
  teal: { bg: "#134e57", ink: "#eaf8f2", accent: "#72c4b8" },
  berry: { bg: "#592548", ink: "#fff1e9", accent: "#e6a1b1" },
  sand: { bg: "#e3d0b2", ink: "#3f3026", accent: "#b18c65" },
  ink: { bg: "#272a49", ink: "#f7f1de", accent: "#aba8d2" },
  sunrise: { bg: "#e88967", ink: "#442b43", accent: "#fcd8a3" },
};
export const publicationLabels = {
  en: {
    contents: "Contents",
    rights: "Copyright",
    dedication: "Dedication",
    about: "About the author",
    back: "About this book",
    missing: "This chapter has not been written yet.",
  },
  ar: {
    contents: "الفهرس",
    rights: "حقوق النشر",
    dedication: "إهداء",
    about: "نبذة عن المؤلف",
    back: "عن هذا الكتاب",
    missing: "لم يُكتب هذا الفصل بعد.",
  },
  sv: {
    contents: "Innehåll",
    rights: "Upphovsrätt",
    dedication: "Dedikation",
    about: "Om författaren",
    back: "Om boken",
    missing: "Det här kapitlet har inte skrivits ännu.",
  },
};
export const pageSizes = {
  A5: { width: 148, height: 210 },
  A4: { width: 210, height: 297 },
  trade: { width: 152.4, height: 228.6 },
};
export type CoverData = {
  title: string;
  subtitle?: string;
  author?: string;
  style?: CoverStyle;
  language?: Book["language"];
  image?: string | null;
  layout?: BookSettings["cover_layout"];
  back?: boolean;
  blurb?: string;
  bio?: string;
};
/** One escaped renderer for editor, PDF, EPUB and the rasterized Word covers. */
export function coverMarkup(data: CoverData): string {
  const color = palettes[data.style || "cobalt"] || palettes.cobalt,
    language = data.language || "en";
  const layout = [
    "editorial",
    "cinematic",
    "minimal",
    "frame",
    "split",
  ].includes(data.layout || "")
    ? data.layout!
    : "editorial";
  const image = data.image
    ? `<img class="pub-cover-art" src="${esc(data.image)}" alt="" />`
    : "";
  const size =
    data.title.length > 90
      ? "8cqi"
      : data.title.length > 50
        ? "10cqi"
        : "13cqi";
  return `<section class="pub-cover pub-layout-${layout}${image ? " pub-has-art" : ""}${data.back ? " pub-back-cover" : ""}" dir="${language === "ar" ? "rtl" : "ltr"}" lang="${language}" style="--pub-bg:${color.bg};--pub-ink:${color.ink};--pub-accent:${color.accent};--pub-title-size:${size};--pub-blurb-size:${(data.blurb || "").length > 1600 ? "2.5cqi" : (data.blurb || "").length > 1000 ? "3.1cqi" : "4cqi"}">${image}<div class="pub-cover-decoration" aria-hidden="true"></div><div class="pub-cover-copy">${data.back ? `<h2>${esc(publicationLabels[language].back)}</h2><p class="pub-back-blurb">${esc(data.blurb || "")}</p>${data.bio ? `<div class="pub-back-bio"><strong>${esc(data.author || publicationLabels[language].about)}</strong><p>${esc(data.bio)}</p></div>` : ""}` : `<h2>${esc(data.title)}</h2>${data.subtitle ? `<p class="pub-cover-subtitle">${esc(data.subtitle)}</p>` : ""}`}<p class="pub-cover-author">${esc(data.author || "")}</p></div></section>`;
}

export const BOOK_DESIGN_CSS = `
.pub-cover{box-sizing:border-box;position:relative;isolation:isolate;container-type:inline-size;width:100%;aspect-ratio:2/3;overflow:hidden;background:var(--pub-bg);color:var(--pub-ink);font-family:"Inter Variable",Inter,Arial,sans-serif;line-height:1.35;text-align:start;break-inside:avoid}
.pub-cover[lang="ar"]{font-family:Naskh,"Noto Naskh Arabic",serif}.pub-cover *{box-sizing:border-box}.pub-cover-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1}
.pub-cover-decoration{position:absolute;width:90%;aspect-ratio:1;border:1px solid var(--pub-accent);border-radius:50%;inset-inline-end:-40%;bottom:-18%;opacity:.5;z-index:0}.pub-has-art .pub-cover-decoration{display:none}
.pub-cover-copy{position:absolute;inset:9%;display:flex;flex-direction:column;justify-content:center;z-index:1;min-width:0}.pub-cover h2{font-family:inherit;font-size:var(--pub-title-size);line-height:1.14;font-weight:700;letter-spacing:-.035em;margin:0;overflow-wrap:anywhere;color:inherit;white-space:pre-line}.pub-cover[lang="ar"] h2{line-height:1.5;letter-spacing:0}.pub-cover .pub-cover-subtitle{font-size:4.4cqi;line-height:1.55;margin:6% 0 0;white-space:pre-line}.pub-cover .pub-cover-author{font-size:3.7cqi;line-height:1.5;margin:10% 0 0;font-weight:500;overflow-wrap:anywhere}
.pub-layout-editorial.pub-has-art .pub-cover-art{height:55%}.pub-layout-editorial.pub-has-art .pub-cover-copy{inset:55% 0 0;padding:7% 9%;justify-content:center;background:var(--pub-bg)}.pub-layout-editorial.pub-has-art h2{font-size:10cqi}.pub-layout-editorial.pub-has-art .pub-cover-author{margin-top:5%}
.pub-layout-cinematic .pub-cover-copy{justify-content:flex-end}.pub-layout-cinematic.pub-has-art:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 12%,#07101c70 45%,#07101cf2 100%)}.pub-layout-cinematic.pub-has-art{color:#fff}
.pub-layout-minimal .pub-cover-copy{text-align:center;justify-content:flex-start;inset:12% 10%}.pub-layout-minimal .pub-cover-art{inset:auto 12% 9%;width:76%;height:41%;border-radius:48% 48% 3px 3px}.pub-layout-minimal.pub-has-art h2{font-size:10cqi}.pub-layout-minimal .pub-cover-author{margin-top:7%}
.pub-layout-frame:before{content:"";position:absolute;inset:5%;border:1px solid var(--pub-accent);z-index:2;pointer-events:none}.pub-layout-frame .pub-cover-copy{inset:14% 10%;text-align:center;padding:8%;background:var(--pub-bg);opacity:.97}.pub-layout-frame .pub-cover-copy:before{content:"✦";font-size:7cqi;margin-bottom:10%}.pub-layout-frame h2{font-size:10cqi}
.pub-layout-split .pub-cover-copy{inset:8%;justify-content:space-between}.pub-layout-split.pub-has-art .pub-cover-art{inset-block:0;inset-inline-end:0;inset-inline-start:auto;width:48%;height:100%}.pub-layout-split.pub-has-art .pub-cover-copy{inset-inline-end:54%;padding:0}.pub-layout-split h2{font-size:10cqi}
.pub-back-cover .pub-cover-art{inset:0;width:100%;height:100%;opacity:.09;border-radius:0}.pub-back-cover.pub-has-art:after,.pub-back-cover:before{display:none}.pub-back-cover .pub-cover-copy,.pub-back-cover.pub-has-art .pub-cover-copy{inset:9%;padding:0;background:none;opacity:1;justify-content:center;text-align:start}.pub-back-cover.pub-has-art{color:var(--pub-ink)}.pub-back-cover h2{font-size:6cqi;margin-bottom:7%}.pub-back-blurb{font-size:var(--pub-blurb-size,4cqi);line-height:1.75;white-space:pre-line;margin:0}.pub-back-bio{border-top:1px solid var(--pub-accent);margin-top:8%;padding-top:7%;font-size:3.3cqi;line-height:1.65;white-space:pre-line}.pub-back-bio p{margin:3% 0 0}.pub-back-cover .pub-cover-author{margin-top:8%}
.publication-document{color:#242a35;font-family:"Inter Variable",Inter,Arial,sans-serif;line-height:1.75}.publication-document[lang="ar"]{font-family:Naskh,"Noto Naskh Arabic",serif}.publication-document.pub-font-sans[lang="ar"]{font-family:Arial,Naskh,sans-serif}.publication-document.pub-font-serif:not([lang="ar"]){font-family:Georgia,"Times New Roman",serif}.publication-document :where(.pub-chapter,.pub-matter,.pub-toc) :is(h1,h2,h3){line-height:1.4;break-after:avoid}.publication-document :where(.pub-chapter,.pub-matter,.pub-toc) h2{font-size:1.7em;margin:0 0 1.2em}.publication-document :where(.pub-chapter,.pub-matter,.pub-toc) h3{font-size:1.22em;margin:1.3em 0 .6em}.publication-document :where(.pub-chapter,.pub-matter,.pub-toc) p{margin:0 0 .85em;orphans:3;widows:3}.publication-document li{margin-bottom:.3em}.publication-document ul,.publication-document ol{padding-inline-start:1.7em}.publication-document .pub-chapter{break-before:page}.pub-chapter-number{font-size:.75em;opacity:.6;margin-bottom:1em;letter-spacing:.15em}.pub-matter{break-before:page;white-space:pre-line}.pub-toc{break-before:page}.pub-toc a{color:inherit;text-decoration:none}.pub-toc p{padding:.6em 0;border-bottom:1px solid #ddd}.pub-toc span{display:inline-block;min-width:2.5em;color:#667085}.pub-missing{font-style:italic;color:#667085}.pub-back-page{break-before:page}
`;
export function publicationBody(book: Book, image?: string): string {
  const s = bookSettings(book),
    l = publicationLabels[book.language];
  const cover = {
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    style: book.cover_style,
    language: book.language,
    layout: s.cover_layout,
    image,
  };
  return (
    `<div class="pub-front-page">${coverMarkup(cover)}</div>` +
    (s.copyright
      ? `<section class="pub-matter"><h2>${l.rights}</h2><p>${esc(s.copyright)}</p></section>`
      : "") +
    (s.dedication
      ? `<section class="pub-matter"><h2>${l.dedication}</h2><p>${esc(s.dedication)}</p></section>`
      : "") +
    `<section class="pub-toc"><h2>${l.contents}</h2>${book.outline.map((c, i) => `<p><a href="#chapter-${c.id}"><span>${i + 1}.</span>${esc(c.title)}</a></p>`).join("")}</section>` +
    book.outline
      .map(
        (c, i) =>
          `<section class="pub-chapter" id="chapter-${c.id}"><div class="pub-chapter-number">${String(i + 1).padStart(2, "0")}</div><h2>${esc(c.title)}</h2>${book.chapters[c.id]?.content ? markdownHtml(book.chapters[c.id].content) : `<p class="pub-missing">${l.missing}</p>`}</section>`,
      )
      .join("") +
    (s.author_bio
      ? `<section class="pub-matter"><h2>${l.about}</h2><p>${esc(s.author_bio)}</p></section>`
      : "") +
    (s.back_cover
      ? `<div class="pub-back-page">${coverMarkup({ ...cover, back: true, blurb: s.back_cover_text })}</div>`
      : "")
  );
}
export function publicationFontSize(book: Book) {
  const s = bookSettings(book),
    base = book.language === "ar" ? 13 : 10.5;
  return (
    base + (s.font_size === "large" ? 2 : s.font_size === "small" ? -1 : 0)
  );
}
