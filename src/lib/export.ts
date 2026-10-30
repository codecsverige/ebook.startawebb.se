import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  ImageRun,
  Footer,
  PageNumber,
} from "docx";
import type { Book } from "./domain";
import { escapeHtml as esc, markdownHtml } from "./export-text";
import { inlineRuns, parseManuscript, stripInlineMarkdown } from "./manuscript";
import type { ExportIllustration } from "./illustration-export";

const palettes: Record<
  Book["cover_style"],
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
export async function pdfHtml(
  book: Book,
  artwork?: { data: Uint8Array; type: string },
  images: Record<string, ExportIllustration> = {},
  backArtwork?: { data: Uint8Array; type: string },
) {
  const [latin, arabic] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      ),
    ),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2",
      ),
    ),
  ]);
  const colors = palettes[book.cover_style];
  const titleSize = book.title.length > 90 ? 20 : book.title.length > 60 ? 24 :
    book.title.length > 38 ? 27 : (book.language === "ar" ? 32 : 29);
  const rtl = book.language === "ar";
  const toc = { en: "Contents", ar: "الفهرس", sv: "Innehåll" }[book.language];
  const dedicationLabel = { en: "Dedication", ar: "الإهداء", sv: "Dedikation" }[book.language];
  const prefaceLabel = { en: "Preface", ar: "المقدمة", sv: "Förord" }[book.language];
  const copyrightLabel = { en: "Copyright", ar: "حقوق النشر", sv: "Upphovsrätt" }[book.language];
  const thanksLabel = { en: "Acknowledgments", ar: "الشكر والتقدير", sv: "Tack" }[book.language];
  const copyrightText = book.copyright_notice?.trim() || "";
  const acknowledgmentsText = book.acknowledgments?.trim() || "";
  const layout = book.layout_theme || "classic";
  const introPages = (copyrightText
    ? `<section class="front-matter"><h2>${copyrightLabel}</h2><p>${esc(copyrightText)}</p></section>` : "") +
    (book.dedication?.trim()
    ? `<section class="front-matter"><h2>${dedicationLabel}</h2><p>${esc(book.dedication)}</p></section>` : "") +
    (book.preface?.trim()
    ? `<section class="front-matter"><h2>${prefaceLabel}</h2>${markdownHtml(book.preface)}</section>` : "");
  const imageMarkup = Object.fromEntries(Object.entries(images).map(([id, image]) => {
    const src = `data:${image.type};base64,${Buffer.from(image.data).toString("base64")}`;
    return [id, `<figure class="interior-image figure-${image.meta.size}"><img src="${src}" alt="${esc(image.meta.alt)}">${image.meta.caption ? `<figcaption>${esc(image.meta.caption)}</figcaption>` : ""}</figure>`];
  }));
  const rearImage = backArtwork ? `<img class="back-image" src="data:${backArtwork.type};base64,${Buffer.from(backArtwork.data).toString("base64")}" alt="">` : "";
  const thanksPage = acknowledgmentsText ?
    `<section class="front-matter"><h2>${thanksLabel}</h2>${markdownHtml(acknowledgmentsText)}</section>` : "";
  const backBlurb = book.back_blurb?.trim() || book.idea;
  const authorBio = book.author_bio?.trim() || "";
  const image =
    artwork && book.use_artwork
      ? `<img class="cover-image" src="data:${esc(artwork.type)};base64,${Buffer.from(artwork.data).toString("base64")}" alt="">`
      : "";
  return `<!doctype html><html lang="${book.language}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>
  @font-face{font-family:Inter;src:url(data:font/woff2;base64,${latin.toString("base64")}) format('woff2');font-weight:100 900}
  @font-face{font-family:Naskh;src:url(data:font/woff2;base64,${arabic.toString("base64")}) format('woff2')}
  .theme-modern h2{font-family:Inter,sans-serif;letter-spacing:-.02em}.theme-modern .chapter-number{color:#5473d2}
  .theme-literary h2{font-family:Georgia,serif;font-weight:normal}.theme-literary section.chapter>h2{text-align:center;margin:14mm 0 11mm}.theme-literary section.chapter>p:first-of-type:first-letter{font-size:1.9em}
  @page{size:A5;margin:17mm 14mm}*{box-sizing:border-box}body{margin:0;color:#242a35;font-family:${rtl ? "Naskh" : "Inter"},sans-serif;font-size:${rtl ? "13" : "10"}pt;line-height:1.8}h1,h2,h3{line-height:1.35;break-after:avoid}h2{font-size:23pt;margin:8mm 0}h3{font-size:${rtl ? "16" : "12"}pt;margin-top:7mm}p{white-space:pre-line;margin:0 0 4mm;orphans:3;widows:3}li{margin-bottom:2mm}ul,ol{padding-inline-start:7mm}section.chapter{break-before:page}.chapter-number{font-size:10pt;letter-spacing:2px;color:#68728a}.cover{height:160mm;position:relative;background:${colors.bg};color:${colors.ink};padding:12mm;overflow:hidden;break-after:page;display:flex;flex-direction:column;justify-content:space-between}.cover-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.85}.cover.has-artwork:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0b0f1e90 0%,#15182344 45%,#0b0f1ea8 100%);z-index:1}.cover.has-artwork h1,.cover.has-artwork p,.cover.has-artwork small{z-index:2;color:#fffdf6}.cover h1{font-size:${titleSize}pt;margin:7mm 0;position:relative;overflow-wrap:anywhere}.cover p,.cover small{position:relative}.cover .cover-subtitle{font-size:13pt;line-height:1.7}.cover .cover-author{font-size:11pt;border-top:1px solid ${colors.accent};padding-top:5mm}.cover:after{content:'';position:absolute;width:125mm;height:125mm;border:1px solid ${colors.accent};border-radius:50%;bottom:-80mm;left:-50mm}.toc{break-before:auto}.toc p{border-bottom:1px solid #e2e2df;padding:3mm 0;display:flex;gap:5mm}.toc span{color:#69738b}.author-note{margin-top:7mm;font-size:9pt;color:#69738b}.front-matter{break-before:page;white-space:pre-wrap}.back-cover{break-before:page;min-height:160mm;height:auto;position:relative;background:${colors.bg};color:${colors.ink};padding:14mm;overflow:visible;display:flex;flex-direction:column;justify-content:space-between}.back-cover h2{font-size:19pt;margin:9mm 0 7mm;overflow-wrap:anywhere}.back-cover .blurb{font-size:${rtl ? 12 : 10}pt;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;hyphens:auto}.back-cover .author-bio{border-top:1px solid ${colors.accent};padding-top:4mm;font-size:9pt;white-space:pre-wrap;overflow-wrap:anywhere}.back-cover small{display:block;letter-spacing:2px}.back-cover.with-artwork{color:#fffdf6}.back-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6}.back-cover.with-artwork:before{content:"";position:absolute;inset:0;background:#10192665;z-index:1}.back-cover>div,.back-cover>small{position:relative;z-index:2}.interior-image{text-align:center;margin:7mm auto;break-inside:avoid}.interior-image img{max-width:100%;max-height:105mm;object-fit:contain}.interior-image.figure-medium{max-width:78%}.interior-image.figure-small{max-width:42%}.interior-image figcaption{font-size:8pt;color:#68728a;line-height:1.5}.scene-divider{text-align:center;margin:9mm 0;letter-spacing:4pt;break-inside:avoid}
  .book-quote{border-inline-start:3px solid #b3a082;padding:4mm 6mm;margin:6mm 0;background:#f9f6f0;font-style:italic;break-inside:avoid}
  .book-note{border:1px solid #c9d7e5;border-inline-start:4px solid #577a9f;padding:4mm 5mm;margin:6mm 0;background:#f4f7fa;break-inside:avoid}
  .page-break{break-before:page;page-break-before:always;height:0;clear:both}
  </style></head><body class="theme-${layout}"><section class="cover${image ? " has-artwork" : ""}">${image}<small aria-hidden="true">✦</small><div><h1>${esc(book.title)}</h1><p class="cover-subtitle">${esc(book.subtitle)}</p></div><p class="cover-author">${esc(book.author)}</p></section>${introPages}<section class="toc"><h2>${toc}</h2>${book.outline.map((c, i) => `<p><span>${i + 1}</span>${esc(c.title)}</p>`).join("")}</section>${book.outline.map((c, i) => `<section class="chapter"><div class="chapter-number">${String(i + 1).padStart(2, "0")}</div><h2>${esc(c.title)}</h2>${markdownHtml(book.chapters[c.id]?.content || "", imageMarkup)}</section>`).join("")}${thanksPage}<section class="back-cover${rearImage ? " with-artwork" : ""}">${rearImage}<div><small>✦</small><h2>${esc(book.title)}</h2><p class="blurb">${esc(backBlurb)}</p></div>${authorBio ? `<div class="author-bio"><strong>${esc(book.author)}</strong><p>${esc(authorBio)}</p></div>` : ""}<small>${esc(book.author)}</small></section></body></html>`;
}
export async function makePdf(
  book: Book,
  artwork?: { data: Uint8Array; type: string },
  images: Record<string, ExportIllustration> = {},
  backArtwork?: { data: Uint8Array; type: string },
) {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core"),
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.CHROMIUM_EXECUTABLE_PATH || (await chromium.executablePath()),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      if (r.url().startsWith("data:") || r.url() === "about:blank")
        void r.continue();
      else void r.abort();
    });
    await page.setContent(await pdfHtml(book, artwork, images, backArtwork), {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.evaluate("document.fonts.ready");
    return await page.pdf({
      format: "A5",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#888"><span class="pageNumber"></span></div>',
      margin: { top: "17mm", bottom: "17mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }
}
export async function makeDocx(
  book: Book,
  artwork?: { data: Uint8Array; type: string },
  images: Record<string, ExportIllustration> = {},
  backArtwork?: { data: Uint8Array; type: string },
) {
  const rtl = book.language === "ar";
  const font = rtl ? "Arial" : "Calibri";
  const base = {
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
  };
  const text = (value: string, bold = false) =>
    new TextRun({
      text: value,
      bold,
      font,
      rightToLeft: rtl,
      size: rtl ? 26 : 22,
    });
  const richText = (value: string, bold = false) => inlineRuns(value).map(run => new TextRun({
    text: run.text, bold: bold || !!run.bold, italics: !!run.italic, font,
    rightToLeft: rtl, size: rtl ? 26 : 22,
  }));
  const children: Paragraph[] = [
    new Paragraph({
      ...base,
      heading: HeadingLevel.TITLE,
      children: [text(book.title, true)],
    }),
    new Paragraph({ ...base, children: [text(book.subtitle)] }),
    new Paragraph({ ...base, children: [text(book.author)] }),
  ];
  if (
    artwork &&
    book.use_artwork &&
    ["image/png", "image/jpeg"].includes(artwork.type)
  ) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: artwork.data,
            type: artwork.type === "image/png" ? "png" : "jpg",
            transformation: { width: 340, height: 440 },
          }),
        ],
      }),
    );
  }
  if (book.copyright_notice?.trim()) children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ ...base, heading: HeadingLevel.HEADING_1,
      children: [text({ en: "Copyright", ar: "حقوق النشر", sv: "Upphovsrätt" }[book.language], true)] }),
    new Paragraph({ ...base, children: [text(book.copyright_notice)] }),
  );
  if (book.dedication?.trim()) children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ ...base, heading: HeadingLevel.HEADING_1,
      children: [text({ en: "Dedication", ar: "الإهداء", sv: "Dedikation" }[book.language], true)] }),
    new Paragraph({ ...base, children: [text(book.dedication)] }),
  );
  if (book.preface?.trim()) {
    children.push(new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ ...base, heading: HeadingLevel.HEADING_1,
        children: [text({ en: "Preface", ar: "المقدمة", sv: "Förord" }[book.language], true)] }));
    for (const block of parseManuscript(book.preface)) {
      if (block.type === "ul" || block.type === "ol") {
        for (const item of block.items)
          children.push(new Paragraph({ ...base, children: [text("• " + stripInlineMarkdown(item))] }));
      } else if (block.type === "heading" || block.type === "paragraph") {
        children.push(new Paragraph({ ...base, children: [text(stripInlineMarkdown(block.text))] }));
      }
    }
  }
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      ...base,
      heading: HeadingLevel.HEADING_1,
      children: [
        text(
          { en: "Contents", ar: "الفهرس", sv: "Innehåll" }[book.language],
          true,
        ),
      ],
    }),
  );
  book.outline.forEach((c, i) =>
    children.push(
      new Paragraph({ ...base, children: [text(`${i + 1}. ${c.title}`)] }),
    ),
  );
  for (const c of book.outline) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        ...base,
        heading: HeadingLevel.HEADING_1,
        children: [text(c.title, true)],
      }),
    );
    for (const block of parseManuscript(book.chapters[c.id]?.content || "")) {
      const paragraphBase = { ...base, alignment: block.align ? ({left:AlignmentType.LEFT,right:AlignmentType.RIGHT,center:AlignmentType.CENTER,justify:AlignmentType.JUSTIFIED})[block.align] : base.alignment };
      if (block.type === "illustration") {
        const image = images[block.id];
        if (!image) continue;
        if (["image/png", "image/jpeg"].includes(image.type)) {
          const maximum = image.meta.size === "small" ? 145 : image.meta.size === "medium" ? 275 : 390;
          const ratio = (image.dimensions?.height || 408) / (image.dimensions?.width || 720);
          const width = Math.min(maximum, 500 / Math.max(0.2, ratio));
          children.push(new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: image.data,
              type: image.type === "image/png" ? "png" : "jpg",
              transformation: { width: Math.round(width), height: Math.round(width * ratio) },
            })] }));
        }
        if (image.meta.caption) children.push(new Paragraph({ ...base,
          alignment: AlignmentType.CENTER, children: [text(image.meta.caption)] }));
        continue;
      }
      if (block.type === "pagebreak") {
        children.push(new Paragraph({children:[new PageBreak()]}));
        continue;
      }
      if (block.type === "quote" || block.type === "note") {
        children.push(new Paragraph({...paragraphBase,
          spacing:{before:160,after:200},
          indent:{left:380,right:250},
          children:richText(block.text,block.type==="note"),
        }));
        continue;
      }
      if (block.type === "divider") {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER,
          spacing: { before: 260, after: 260 }, children: [text("✦  ✦  ✦")] }));
        continue;
      }
      if (block.type === "heading") {
        children.push(new Paragraph({
          ...paragraphBase,
          heading: block.level >= 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
          spacing: { before: 260, after: 100 },
          children: richText(block.text, true),
        }));
      } else if (block.type === "ul" || block.type === "ol") {
        block.items.forEach((item, index) =>
          children.push(new Paragraph({
            ...paragraphBase,
            spacing: { after: 90 },
            children: [text(`${block.type === "ul" ? "•" : `${index + 1}.`}  `), ...richText(item)],
          })),
        );
      } else {
        children.push(new Paragraph({
          ...paragraphBase,
          spacing: { after: 170 },
          children: richText(block.text),
        }));
      }
    }
  }
  if (book.acknowledgments?.trim()) {
    children.push(new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ ...base, heading: HeadingLevel.HEADING_1,
        children: [text({ en: "Acknowledgments", ar: "الشكر والتقدير", sv: "Tack" }[book.language], true)] }));
    children.push(new Paragraph({ ...base, children: [text(book.acknowledgments)] }));
  }
  if (backArtwork && ["image/png", "image/jpeg"].includes(backArtwork.type)) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: backArtwork.data, type: backArtwork.type === "image/png" ? "png" : "jpg",
        transformation: { width: 340, height: 440 } })] }));
  }
  // The EPUB and PDF include a distinct back cover; Word includes the same editable text.
  children.push(new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ ...base, heading: HeadingLevel.HEADING_1, children: [text(book.title, true)] }),
    new Paragraph({ ...base, children: [text(book.back_blurb?.trim() || book.idea)] }));
  if (book.author_bio?.trim()) children.push(
    new Paragraph({ ...base, children: [text(book.author, true)] }),
    new Paragraph({ ...base, children: [text(book.author_bio)] }),
  );
  return Packer.toBuffer(
    new Document({
      creator: book.author || "Ebook Studio",
      title: book.title,
      description: book.subtitle,
      styles: {
        default: { document: { run: { font, size: 22 }, paragraph: base } },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 8391, height: 11906 },
              margin: { top: 800, bottom: 800, left: 800, right: 800 },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 18,
                      color: "777777",
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    }),
  );
}
