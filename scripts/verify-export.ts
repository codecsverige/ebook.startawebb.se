import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createBrotliDecompress, brotliDecompressSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { makePdf, makeDocx } from "../src/lib/export";
import { examples } from "../src/lib/samples";
import type { Book, Locale } from "../src/lib/domain";

async function main() {
  // The managed QA filesystem cannot chown tar entries. Pre-expand the official
  // bundled runtime for this Linux-only export check without preserving owners.
  // Production uses Chromium's normal extraction under Vercel's non-root user.
  if (process.env.EBOOK_QA_UNPACK === "1") {
    const bin = join(process.cwd(), "node_modules/@sparticuz/chromium/bin");
    await pipeline(
      createReadStream(join(bin, "chromium.br")),
      createBrotliDecompress(),
      createWriteStream(join(tmpdir(), "chromium"), { mode: 0o700 }),
    );
    for (const name of ["fonts", "swiftshader"]) {
      const destination = name === "fonts" ? join(tmpdir(), "fonts") : tmpdir();
      await mkdir(destination, { recursive: true });
      execFileSync("tar", ["--no-same-owner", "-xf", "-", "-C", destination], {
        input: brotliDecompressSync(
          await readFile(join(bin, `${name}.tar.br`)),
        ),
      });
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "ebook-export-"));
  for (const language of ["ar", "en", "sv"] as Locale[]) {
    const sample = examples(language)[0];
    const outline = [1, 2, 3].map((n) => ({
      id: `00000000-0000-4000-8000-00000000000${n}`,
      title: `${n}. ${sample.chapter}`,
      summary: "A useful short summary.",
    }));
    const book: Book = {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000002",
      idea: "A practical guide for building useful daily habits.",
      audience: "Curious readers",
      kind: "guide",
      language,
      tone: "clear",
      author: "Ebook Studio",
      chapter_count: 3,
      title: sample.title,
      subtitle: sample.subtitle,
      outline,
      chapters: Object.fromEntries(
        outline.map((c) => [
          c.id,
          { content: sample.content, summary: c.summary },
        ]),
      ),
      cover_style: "sage",
      cover_path: null,
      use_artwork: false,
      unlocked: true,
      revision: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const pdf = await makePdf(book);
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
    const pdfPath = join(dir, `${language}.pdf`);
    await writeFile(pdfPath, pdf);
    const docx = await makeDocx(book);
    assert.equal(docx.subarray(0, 2).toString(), "PK");
    const docPath = join(dir, `${language}.docx`);
    await writeFile(docPath, docx);
    const xml = execFileSync("unzip", ["-p", docPath, "word/document.xml"], {
      encoding: "utf8",
    });
    assert.ok(xml.includes(sample.title));
    if (language === "ar") assert.ok(xml.includes("w:bidi"));
    execFileSync("pdftotext", [
      "-layout",
      pdfPath,
      join(dir, `${language}.txt`),
    ]);
    const text = await readFile(join(dir, `${language}.txt`), "utf8");
    assert.ok(text.length > 300);
    if (language === "ar") assert.match(text, /[\u0600-\u06ff]/u);
    execFileSync("pdftoppm", [
      "-f",
      "3",
      "-singlefile",
      "-scale-to",
      "1100",
      "-png",
      pdfPath,
      join(dir, `${language}-page`),
    ]);
    console.log(
      `${language}: PDF ${pdf.length} bytes; Word ${docx.length} bytes; text extraction verified.`,
    );
  }
  console.log(`QA files: ${dir}`);
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
