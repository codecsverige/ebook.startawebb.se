import { coverMarkup, type CoverData } from "@/lib/book-design";
import { coverStyles, type CoverStyle } from "@/lib/domain";
export function BookCover({
  title,
  subtitle = "",
  author = "",
  style = "cobalt",
  language = "en",
  image,
  small = false,
  layout,
  back,
  blurb,
  bio,
}: {
  title: string;
  subtitle?: string;
  author?: string;
  style?: string;
  language?: CoverData["language"];
  image?: string | null;
  small?: boolean;
  layout?: CoverData["layout"];
  back?: boolean;
  blurb?: string;
  bio?: string;
}) {
  const palette = coverStyles.includes(style as CoverStyle)
    ? (style as CoverStyle)
    : "cobalt";
  return (
    <div
      className={`book-cover-v2${small ? " cover-small-v2" : ""}`}
      dangerouslySetInnerHTML={{
        __html: coverMarkup({
          title,
          subtitle,
          author,
          style: palette,
          language,
          image,
          layout,
          back,
          blurb,
          bio,
        }),
      }}
    />
  );
}
