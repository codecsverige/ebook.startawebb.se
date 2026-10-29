import { Buffer } from "node:buffer";
import { bookSettings, type Book } from "./domain";
import { coverMarkup, BOOK_DESIGN_CSS, publicationLabels } from "./book-design";
import { escapeHtml, markdownHtml } from "./export-text";

type Asset = { name: string; body: string | Uint8Array };

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
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
    const data =
      typeof asset.body === "string"
        ? Buffer.from(asset.body, "utf8")
        : Buffer.from(asset.body);
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
  renderedCovers?: Uint8Array[],
): Buffer {
  const lang = book.language,
    rtl = lang === "ar",
    dir = rtl ? "rtl" : "ltr",
    s = bookSettings(book),
    l = publicationLabels[lang];
  const title = escapeHtml(book.title),
    author = escapeHtml(book.author || "");
  const content: Asset[] = [
    { name: "mimetype", body: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      body: '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles></container>',
    },
  ];
  const css =
    BOOK_DESIGN_CSS +
    `body{font-family:${s.font === "serif" ? "serif" : "sans-serif"};line-height:1.75;padding:1em;color:#242a35;font-size:${s.font_size === "large" ? "1.15" : s.font_size === "small" ? ".9" : "1"}em}h1,h2,h3{line-height:1.4}p{margin:0 0 1em}a{color:inherit}.epub-cover{padding:0;margin:0;text-align:center}.epub-cover img{max-width:100%;height:auto}.matter{white-space:pre-line}`;
  content.push({ name: "OEBPS/style.css", body: css });
  const xhtml = (name: string, body: string): Asset => ({
    name: "OEBPS/" + name,
    body:
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' +
      lang +
      '" lang="' +
      lang +
      '" dir="' +
      dir +
      '"><head><meta charset="utf-8"/><title>' +
      title +
      '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' +
      body +
      "</body></html>",
  });
  const coverImage =
    renderedCovers?.[0] ||
    (artwork &&
    book.use_artwork &&
    ["image/png", "image/jpeg"].includes(artwork.type)
      ? artwork.data
      : undefined);
  const ext =
    renderedCovers?.[0] || artwork?.type === "image/png" ? "png" : "jpg";
  if (coverImage)
    content.push({ name: "OEBPS/images/cover." + ext, body: coverImage });
  const cover = {
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    style: book.cover_style,
    language: lang,
    layout: s.cover_layout,
  };
  content.push(
    xhtml(
      "cover.xhtml",
      renderedCovers?.[0]
        ? '<section class="epub-cover"><img src="images/cover.png" alt="' +
            title +
            '"/></section>'
        : coverMarkup({
            ...cover,
            image: coverImage ? "images/cover." + ext : undefined,
          }),
    ),
  );
  const matters = [
    { id: "copyright", title: l.rights, text: s.copyright },
    { id: "dedication", title: l.dedication, text: s.dedication },
    { id: "about-author", title: l.about, text: s.author_bio },
  ].filter((m) => m.text);
  for (const m of matters)
    content.push(
      xhtml(
        m.id + ".xhtml",
        '<section class="matter"><h1>' +
          escapeHtml(m.title) +
          "</h1><p>" +
          escapeHtml(m.text) +
          "</p></section>",
      ),
    );
  const toc = book.outline
    .map(
      (c, i) =>
        '<li><a href="chapter-' +
        (i + 1) +
        '.xhtml">' +
        escapeHtml(c.title) +
        "</a></li>",
    )
    .join("");
  content.push({
    name: "OEBPS/nav.xhtml",
    body:
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' +
      lang +
      '" dir="' +
      dir +
      '"><head><meta charset="utf-8"/><title>' +
      escapeHtml(l.contents) +
      '</title></head><body><nav epub:type="toc" id="toc"><h1>' +
      escapeHtml(l.contents) +
      "</h1><ol>" +
      toc +
      "</ol></nav></body></html>",
  });
  book.outline.forEach((c, i) =>
    content.push(
      xhtml(
        "chapter-" + (i + 1) + ".xhtml",
        "<section><h1>" +
          escapeHtml(c.title) +
          "</h1>" +
          markdownHtml(book.chapters[c.id]?.content || "") +
          "</section>",
      ),
    ),
  );
  if (s.back_cover) {
    if (renderedCovers?.[1])
      content.push({
        name: "OEBPS/images/back-cover.png",
        body: renderedCovers[1],
      });
    content.push(
      xhtml(
        "back-cover.xhtml",
        renderedCovers?.[1]
          ? '<section class="epub-cover"><img src="images/back-cover.png" alt="' +
              escapeHtml(l.back) +
              '"/></section>'
          : coverMarkup({ ...cover, back: true, blurb: s.back_cover_text }),
      ),
    );
  }
  const manifest = [
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    ...matters.map(
      (m) =>
        '<item id="' +
        m.id +
        '" href="' +
        m.id +
        '.xhtml" media-type="application/xhtml+xml"/>',
    ),
    ...book.outline.map(
      (_, i) =>
        '<item id="ch' +
        (i + 1) +
        '" href="chapter-' +
        (i + 1) +
        '.xhtml" media-type="application/xhtml+xml"/>',
    ),
    ...(coverImage
      ? [
          '<item id="cover-img" href="images/cover.' +
            ext +
            '" media-type="image/' +
            (ext === "jpg" ? "jpeg" : "png") +
            '" properties="cover-image"/>',
        ]
      : []),
    ...(s.back_cover
      ? [
          '<item id="back-cover" href="back-cover.xhtml" media-type="application/xhtml+xml"/>',
        ]
      : []),
    ...(s.back_cover && renderedCovers?.[1]
      ? [
          '<item id="back-img" href="images/back-cover.png" media-type="image/png"/>',
        ]
      : []),
  ].join("");
  const spine =
    '<itemref idref="cover"/>' +
    matters
      .filter((m) => m.id !== "about-author")
      .map((m) => '<itemref idref="' + m.id + '"/>')
      .join("") +
    '<itemref idref="nav"/>' +
    book.outline
      .map((_, i) => '<itemref idref="ch' + (i + 1) + '"/>')
      .join("") +
    (s.author_bio ? '<itemref idref="about-author"/>' : "") +
    (s.back_cover ? '<itemref idref="back-cover"/>' : "");
  content.push({
    name: "OEBPS/content.opf",
    body:
      '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="' +
      lang +
      '"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:' +
      book.id +
      "</dc:identifier><dc:title>" +
      title +
      "</dc:title><dc:language>" +
      lang +
      "</dc:language>" +
      (book.author ? "<dc:creator>" + author + "</dc:creator>" : "") +
      '<meta property="dcterms:modified">' +
      new Date().toISOString().replace(/\.\d{3}Z$/, "Z") +
      "</meta></metadata><manifest>" +
      manifest +
      '</manifest><spine page-progression-direction="' +
      dir +
      '">' +
      spine +
      "</spine></package>",
  });
  return zip(content);
}
