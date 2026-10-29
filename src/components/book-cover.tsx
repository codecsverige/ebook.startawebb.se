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
      className={`book-cover cover-${style} ${small ? "cover-small" : ""} ${image ? "has-artwork" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
    >
      {image && <img className="cover-art" src={image} alt="" />}
      <div className="cover-grain" />
      <div className="cover-orbit orbit-one" />
      <div className="cover-orbit orbit-two" />
      <div className="cover-top" aria-hidden="true">
        <BookOpen size={18} />
        <span>✦</span>
      </div>
      <div className="cover-copy">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="cover-bottom">
        <span>{author || "\u00a0"}</span>
        <span className="cover-star" aria-hidden="true">
          ✳
        </span>
      </div>
    </div>
  );
}

/** Back cover uses the exact same palette and dimensions as the front cover.
 * It is part of the book, not a claimed print-ready wrap/spine.
 */
export function BookBackCover({
  style = "cobalt", language = "en", title, author = "", blurb = "", authorBio = "", image = null,
}: {
  style?: string; language?: string; title: string; author?: string;
  blurb?: string; authorBio?: string; image?: string | null;
}) {
  return (
    <div className={`book-cover cover-${style} cover-back ${image ? "has-artwork" : ""}`} dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
      {image && <img className="cover-art" src={image} alt="" />}
      <div className="cover-grain" />
      <div className="cover-orbit orbit-one" />
      <div className="cover-back-content">
        <span className="cover-back-kicker">✦</span>
        <h2>{title}</h2>
        <p className="cover-back-blurb">{blurb}</p>
        {authorBio && <div className="cover-back-author">
          <strong>{author}</strong>
          <p>{authorBio}</p>
        </div>}
      </div>
      <div className="cover-bottom"><span>{author || "\u00a0"}</span><span className="cover-star" aria-hidden="true">✳</span></div>
    </div>
  );
}
