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
import { bookSettings, type Book } from "./domain";
import { escapeHtml as esc } from "./export-text";
import { parseManuscript, stripInlineMarkdown } from "./manuscript";
import {
  BOOK_DESIGN_CSS,
  publicationBody,
  publicationFontSize,
  pageSizes,
  coverMarkup,
  publicationLabels,
} from "./book-design";

type Artwork = { data: Uint8Array; type: string };
let fonts: Promise<string> | undefined;
function fontStyles() {
  return (fonts ||= Promise.all([
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
  ]).then(
    ([latin, arabic]) =>
      `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${latin.toString("base64")}) format('woff2');font-weight:100 900}@font-face{font-family:Naskh;src:url(data:font/woff2;base64,${arabic.toString("base64")}) format('woff2')}`,
  ));
}
function imageData(book: Book, artwork?: Artwork) {
  return artwork && book.use_artwork
    ? `data:${artwork.type};base64,${Buffer.from(artwork.data).toString("base64")}`
    : undefined;
}
export async function pdfHtml(book: Book, artwork?: Artwork) {
  const settings = bookSettings(book),
    size = pageSizes[settings.page_size];
  return `<!doctype html><html lang="${book.language}" dir="${book.language === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>${await fontStyles()}${BOOK_DESIGN_CSS}
  @page{size:${size.width}mm ${size.height}mm;margin:17mm 14mm}*{box-sizing:border-box}body{margin:0}.publication-document{font-size:${publicationFontSize(book)}pt}.pub-cover{height:${size.height - 34}mm;aspect-ratio:auto}.pub-front-page{break-after:page}.pub-matter,.pub-toc,.pub-chapter{padding:0}.pub-toc{break-before:auto}.pub-matter+.pub-toc{break-before:page}.pub-front-page+.pub-matter{break-before:auto}a{color:inherit;text-decoration:none}
  </style></head><body class="publication-document pub-font-${settings.font}" lang="${book.language}">${publicationBody(book, imageData(book, artwork))}</body></html>`;
}
async function renderer() {
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
    page.on("request", (request) => {
      if (request.url().startsWith("data:") || request.url() === "about:blank")
        void request.continue();
      else void request.abort();
    });
    return { browser, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
export async function makePdf(book: Book, artwork?: Artwork) {
  const { browser, page } = await renderer();
  try {
    await page.setContent(await pdfHtml(book, artwork), {
      waitUntil: "load",
      timeout: 30000,
    });
    await page.evaluate("document.fonts.ready");
    return await page.pdf({
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
/** Rasterize only cover artwork, preserving the exact chosen layout in Word.
 * The manuscript remains native, accessible, editable Word text. */
export async function makeCoverImages(book: Book, artwork?: Artwork) {
  const settings = bookSettings(book),
    size = pageSizes[settings.page_size];
  const { browser, page } = await renderer();
  const width = 1600,
    height = Math.round((width * (size.height - 34)) / (size.width - 28));
  const images: Uint8Array[] = [];
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (const back of settings.back_cover ? [false, true] : [false]) {
      const markup = coverMarkup({
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        style: book.cover_style,
        language: book.language,
        layout: settings.cover_layout,
        image: imageData(book, artwork),
        back,
        blurb: settings.back_cover_text,
      });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${await fontStyles()}${BOOK_DESIGN_CSS}html,body{margin:0}.pub-cover{width:${width}px;height:${height}px;aspect-ratio:auto}</style></head><body>${markup}</body></html>`,
        { waitUntil: "load", timeout: 30000 },
      );
      await page.evaluate("document.fonts.ready");
      images.push(await page.screenshot({ type: "png" }));
    }
    return images;
  } finally {
    await browser.close();
  }
}
export async function makeDocx(book: Book, artwork?: Artwork) {
  const rtl = book.language === "ar",
    s = bookSettings(book),
    size = pageSizes[s.page_size],
    l = publicationLabels[book.language];
  const font = rtl ? "Arial" : s.font === "serif" ? "Georgia" : "Calibri",
    pointSize = Math.round(publicationFontSize(book) * 2);
  const base = {
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
  };
  const text = (value: string, bold = false) =>
    new TextRun({ text: value, bold, font, rightToLeft: rtl, size: pointSize });
  const covers = await makeCoverImages(book, artwork);
  const coverParagraph = (data: Uint8Array) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, before: 0 },
      children: [
        new ImageRun({
          data,
          type: "png",
          transformation: {
            width: Math.floor((size.width - 28) * 3.6),
            height: Math.floor((size.height - 34) * 3.6),
          },
          altText: { title: book.title, description: l.back, name: book.title },
        }),
      ],
    });
  const children: Paragraph[] = [coverParagraph(covers[0])];
  const newPage = () =>
    children.push(new Paragraph({ children: [new PageBreak()] }));
  const heading = (title: string) =>
    children.push(
      new Paragraph({
        ...base,
        heading: HeadingLevel.HEADING_1,
        children: [text(title, true)],
      }),
    );
  function matter(title: string, value: string) {
    if (value) {
      newPage();
      heading(title);
      value
        .split(/\n\s*\n/)
        .forEach((p) =>
          children.push(new Paragraph({ ...base, children: [text(p)] })),
        );
    }
  }
  matter(l.rights, s.copyright);
  matter(l.dedication, s.dedication);
  newPage();
  heading(l.contents);
  book.outline.forEach((c, i) =>
    children.push(
      new Paragraph({ ...base, children: [text(`${i + 1}. ${c.title}`)] }),
    ),
  );
  for (const c of book.outline) {
    newPage();
    heading(c.title);
    for (const block of parseManuscript(book.chapters[c.id]?.content || "")) {
      if (block.type === "heading")
        children.push(
          new Paragraph({
            ...base,
            heading:
              block.level >= 3
                ? HeadingLevel.HEADING_3
                : HeadingLevel.HEADING_2,
            spacing: { before: 260, after: 100 },
            children: [text(stripInlineMarkdown(block.text), true)],
          }),
        );
      else if (block.type === "ul" || block.type === "ol")
        block.items.forEach((item, i) =>
          children.push(
            new Paragraph({
              ...base,
              spacing: { after: 90 },
              children: [
                text(
                  `${block.type === "ul" ? "•" : `${i + 1}.`}  ${stripInlineMarkdown(item)}`,
                ),
              ],
            }),
          ),
        );
      else
        children.push(
          new Paragraph({
            ...base,
            spacing: { after: 170 },
            children: [text(stripInlineMarkdown(block.text))],
          }),
        );
    }
  }
  matter(l.about, s.author_bio);
  if (s.back_cover && covers[1]) {
    newPage();
    children.push(coverParagraph(covers[1]));
  }
  return Packer.toBuffer(
    new Document({
      creator: book.author || "Ebook Studio",
      title: book.title,
      description: book.subtitle,
      styles: {
        default: {
          document: {
            run: { font, size: pointSize },
            paragraph: {
              ...base,
              spacing: { line: Math.round(pointSize * 15) },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: Math.round(size.width * 56.6929),
                height: Math.round(size.height * 56.6929),
              },
              margin: { top: 964, bottom: 964, left: 794, right: 794 },
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
