import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" style={{ padding: "90px 30px", textAlign: "center" }}>
      <h1>404</h1>
      <p>This page is unavailable. / الصفحة غير موجودة. / Sidan finns inte.</p>
      <Link href="/en">Ebook Studio →</Link>
    </main>
  );
}
