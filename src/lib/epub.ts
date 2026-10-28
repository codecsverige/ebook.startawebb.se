import { Buffer } from "node:buffer";
import type { Book } from "./domain";
import { escapeHtml, markdownHtml } from "./export-text";

type Asset = { name: string; body: string | Uint8Array };

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** EPUB requires an uncompressed mimetype entry first. No external ZIP dependency. */
function zip(entries: Asset[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const asset of entries) {
    const name = Buffer.from(asset.name, "utf8");
    const data = typeof asset.body === "string" ? Buffer.from(asset.body, "utf8") : Buffer.from(asset.body);
    const checksum = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt32LE(checksum, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    locals.push(head, name, data);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += head.length + name.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

export function makeEpub(
  book: Book,
  artwork?: { data: Uint8Array; type: string },
): Buffer {
  const lang = book.language;
  const rtl = lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const title = escapeHtml(book.title);
  const subtitle = escapeHtml(book.subtitle);
  const author = escapeHtml(book.author || "Ebook Studio");
  const content: Asset[] = [
    { name: "mimetype", body: "application/epub+zip" },
    { name: "META-INF/container.xml", body:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles></container>' },
  ];
  const theme: Record<string, [string, string]> = {
    cobalt: ["#3159df", "#fffdf6"],
    sage: ["#d8decd", "#293e34"],
    clay: ["#e6bba1", "#593329"],
    midnight: ["#17243f", "#fff8eb"],
    plum: ["#603b68", "#fff7ef"],
    ivory: ["#f5eddf", "#322b29"],
    forest: ["#173f36", "#f8f3db"],
    ember: ["#8a342e", "#fff3db"],
    lagoon: ["#124b64", "#f5fcfb"],
    rose: ["#f1d4d9", "#542d3d"],
    noir: ["#161821", "#f4e8d7"],
    sky: ["#b9d9f1", "#1f4678"],
    gold: ["#d5ac53", "#332512"],
    teal: ["#176c6b", "#fff9e7"],
    berry: ["#803655", "#fff4ec"],
    sand: ["#e4d2b8", "#4f3f32"],
    ink: ["#29374a", "#f5f4ed"],
    sunrise: ["#f4b48a", "#56304b"],
  };
  const [bg, ink] = theme[book.cover_style] || theme.cobalt;
  const css =
    "body{font-family:serif;line-height:1.65;color:#273142;padding:1em;}" +
    "h1,h2,h3,h4{line-height:1.35;page-break-after:avoid;}" +
    "p{margin:.4em 0 1em;}ul,ol{padding-inline-start:2em;}" +
    ".cover{background:" + bg + ";color:" + ink + ";padding:2em;min-height:78vh;display:flex;flex-direction:column;justify-content:space-between;}" +
    ".cover img{max-width:100%;max-height:48vh;object-fit:cover;}" +
    ".author{font-size:.85em}.chapter-num{opacity:.6;font-size:.8em;}";
  content.push({ name: "OEBPS/style.css", body: css });
  const xhtml = (name: string, body: string): Asset => ({
    name: "OEBPS/" + name,
    body: '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + lang +
      '" lang="' + lang + '" dir="' + dir + '"><head><meta charset="utf-8" />' +
      '<link rel="stylesheet" type="text/css" href="style.css" /><title>' + title +
      '</title></head><body>' + body + '</body></html>',
  });
  const hasImage = Boolean(artwork && book.use_artwork &&
    ["image/png", "image/jpeg"].includes(artwork.type));
  const extension = artwork?.type === "image/png" ? "png" : "jpg";
  if (hasImage) content.push({ name: "OEBPS/images/cover." + extension, body: artwork!.data });
  content.push(xhtml("cover.xhtml",
    '<section class="cover">' +
    (hasImage ? '<img src="images/cover.' + extension + '" alt="" />' : "") +
    '<div><h1>' + title + '</h1><p>' + subtitle + '</p></div>' +
    '<p class="author">' + author + '</p></section>'));
  const contentsLabel = { en: "Contents", ar: "الفهرس", sv: "Innehåll" }[lang];
  const toc = book.outline.map((c, i) =>
    '<li><a href="chapter-' + (i + 1) + '.xhtml">' +
    escapeHtml(c.title) + '</a></li>').join("");
  const nav = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + lang +
    '" lang="' + lang + '" dir="' + dir + '"><head><meta charset="utf-8" />' +
    '<title>' + escapeHtml(contentsLabel) + '</title></head><body>' +
    '<nav epub:type="toc" id="toc"><h1>' + escapeHtml(contentsLabel) +
    '</h1><ol>' + toc + '</ol></nav></body></html>';
  content.push({ name: "OEBPS/nav.xhtml", body: nav });
  book.outline.forEach((chapter, i) => {
    content.push(xhtml("chapter-" + (i + 1) + ".xhtml",
      '<section><p class="chapter-num">' + (i + 1) + '</p><h1>' +
      escapeHtml(chapter.title) + '</h1>' +
      markdownHtml(book.chapters[chapter.id]?.content || "") + '</section>'));
  });
  const manifest = [
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    ...book.outline.map((_, i) => '<item id="ch' + (i + 1) + '" href="chapter-' +
      (i + 1) + '.xhtml" media-type="application/xhtml+xml"/>'),
    ...(hasImage ? ['<item id="cover-img" href="images/cover.' + extension +
      '" media-type="image/' + (extension === "jpg" ? "jpeg" : "png") +
      '" properties="cover-image"/>'] : []),
  ].join("");
  const spine = '<itemref idref="cover"/>' +
    book.outline.map((_, i) => '<itemref idref="ch' + (i + 1) + '"/>').join("");
  const opf = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
    'unique-identifier="pub-id" xml:lang="' + lang + '">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="pub-id">urn:uuid:' + book.id + '</dc:identifier>' +
    '<dc:title>' + title + '</dc:title><dc:language>' + lang +
    '</dc:language><dc:creator>' + author + '</dc:creator>' +
    '<meta property="dcterms:modified">' +
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z") +
    '</meta></metadata><manifest>' + manifest +
    '</manifest><spine page-progression-direction="' + (rtl ? "rtl" : "ltr") +
    '">' + spine + '</spine></package>';
  content.push({ name: "OEBPS/content.opf", body: opf });
  return zip(content);
}
