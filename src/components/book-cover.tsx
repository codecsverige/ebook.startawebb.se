import { BookOpen } from "lucide-react";
export function BookCover({
  title,
  subtitle = "",
  author = "",
  style = "cobalt",
  language = "en",
  image,
  small = false,
}: {
  title: string;
  subtitle?: string;
  author?: string;
  style?: string;
  language?: string;
  image?: string | null;
  small?: boolean;
}) {
  return (
    <div
      className={`book-cover cover-${style} ${small ? "cover-small" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
    >
      {image && <img className="cover-art" src={image} alt="" />}
      <div className="cover-grain" />
      <div className="cover-orbit orbit-one" />
      <div className="cover-orbit orbit-two" />
      <div className="cover-top">
        <BookOpen size={18} />
        <span>EBOOK STUDIO</span>
      </div>
      <div className="cover-copy">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="cover-bottom">
        <span>{author || "EBOOK STUDIO"}</span>
        <span className="cover-star" aria-hidden="true">
          ✳
        </span>
      </div>
    </div>
  );
}
