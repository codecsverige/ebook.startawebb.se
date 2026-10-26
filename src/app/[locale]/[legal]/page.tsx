import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header, Footer } from "@/components/brand";
import { isLocale } from "@/lib/domain";
import { copy, tr } from "@/lib/i18n";
type Props = { params: Promise<{ locale: string; legal: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, legal } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: legal === "privacy" ? copy[locale].privacy : copy[locale].terms,
    alternates: { canonical: `/${locale}/${legal}` },
  };
}
export default async function Legal({ params }: Props) {
  const { locale, legal } = await params;
  if (!isLocale(locale) || !["privacy", "terms"].includes(legal)) notFound();
  const t = copy[locale];
  const privacy = legal === "privacy";
  const sections = privacy
    ? [
        [
          tr(
            locale,
            "Who operates the studio",
            "من يدير الاستوديو",
            "Vem driver studion",
          ),
          tr(
            locale,
            "Ebook Studio is operated by the service operator identified below. Contact the operator for access, correction, deletion, and privacy questions.",
            "يدير Ebook Studio المشغّل المذكور أدناه. تواصل معه لطلبات الاطلاع والتصحيح والحذف وأسئلة الخصوصية.",
            "Ebook Studio drivs av den tjänsteoperatör som anges nedan. Kontakta operatören för tillgång, rättelse, radering och integritetsfrågor.",
          ),
        ],
        [
          tr(
            locale,
            "What is processed",
            "البيانات المعالجة",
            "Vad som behandlas",
          ),
          tr(
            locale,
            "We process your email and authentication identifiers to provide an account; your book briefs, chapters and artwork to deliver the service; order identifiers and credit balances for purchases; and limited technical usage records for security and cost control. Account and contract performance, legal obligations and legitimate security interests are the purposes and legal bases. Do not include sensitive personal data in book briefs.",
            "نعالج بريدك ومعرّفات الدخول لتوفير الحساب، وأفكار الكتب وفصولها وصورها لتنفيذ الخدمة، ومعرّفات الطلبات والرصيد للمشتريات، وسجلات تقنية محدودة للأمان وضبط التكلفة. ترتبط المعالجة بتنفيذ الخدمة والالتزامات القانونية والمصلحة المشروعة في الأمان. لا تضع بيانات شخصية حساسة في وصف الكتاب.",
            "Vi behandlar e-post och inloggningsidentifierare för kontot, bokunderlag, kapitel och bilder för tjänsten, orderidentifierare och krediter för köp samt begränsade tekniska uppgifter för säkerhet och kostnadskontroll. Ändamål och rättsliga grunder är avtal, rättsliga skyldigheter och berättigade säkerhetsintressen. Lägg inte känsliga personuppgifter i bokunderlaget.",
          ),
        ],
        [
          tr(locale, "Service providers", "مزوّدو الخدمة", "Leverantörer"),
          tr(
            locale,
            "Vercel hosts the application and durable jobs; Supabase stores accounts, manuscripts and private artwork; Vercel AI Gateway and the selected model provider process the text or image prompts needed for generation; Lemon Squeezy processes payments when enabled. Provider retention, international transfers and safeguards depend on the configured provider agreements. Your manuscript is not made publicly searchable by this application.",
            "تستضيف Vercel التطبيق ومهام التوليد، وتخزّن Supabase الحسابات والنصوص والصور الخاصة، وتعالج Vercel AI Gateway ومزوّد النموذج النصوص اللازمة للتوليد، وتتولى Lemon Squeezy المدفوعات عند تفعيلها. تعتمد مدة الاحتفاظ والنقل الدولي وضماناته على اتفاقيات المزوّدين المفعّلة. لا ينشر التطبيق كتابك للفهرسة العامة.",
            "Vercel tillhandahåller drift och bakgrundsjobb, Supabase lagrar konton, manus och privata bilder, Vercel AI Gateway och vald modellleverantör behandlar underlag för generering och Lemon Squeezy hanterar betalningar när de är aktiverade. Lagringstid, internationella överföringar och skydd beror på konfigurerade leverantörsavtal. Applikationen publicerar inte ditt manus för sökmotorer.",
          ),
        ],
        [
          tr(
            locale,
            "Storage and deletion",
            "الحفظ والحذف",
            "Lagring och radering",
          ),
          tr(
            locale,
            "Books remain until you delete them or close your account. Up to 20 recent saved versions are retained per book. You can delete your books and account in the workspace. Necessary billing records and provider backups may persist for their applicable retention periods. Contact support to request a machine-readable copy of account data. Essential login cookies are used; this version includes no advertising cookies or marketing trackers. You may complain to the Swedish Authority for Privacy Protection (IMY).",
            "تبقى الكتب حتى تحذفها أو تغلق حسابك. نحفظ حتى 20 نسخة سابقة لكل كتاب. يمكنك حذف الكتب والحساب من مساحة العمل. قد تبقى سجلات الفوترة اللازمة ونسخ المزوّدين الاحتياطية للفترات المطبّقة. اطلب من الدعم نسخة قابلة للقراءة آليًا من بيانات الحساب. نستخدم ملفات دخول ضرورية دون متتبّعات إعلانية في هذه النسخة. يمكنك الشكوى لدى هيئة حماية الخصوصية السويدية IMY.",
            "Böcker sparas tills du raderar dem eller stänger kontot. Upp till 20 tidigare versioner sparas per bok. Du kan radera böcker och konto i arbetsytan. Nödvändiga fakturauppgifter och leverantörers säkerhetskopior kan finnas kvar under tillämpliga tider. Kontakta support för en maskinläsbar kopia av kontouppgifter. Endast nödvändiga inloggningskakor används; versionen saknar annonskakor och marknadsföringsspårning. Du kan klaga hos Integritetsskyddsmyndigheten (IMY).",
          ),
        ],
      ]
    : [
        [
          tr(locale, "The service", "الخدمة", "Tjänsten"),
          tr(
            locale,
            "The studio creates AI-assisted nonfiction drafts and formatted exports. A free account includes one outline and one sample chapter. One book credit unlocks one book with 3–10 chapters, export and up to two cover artworks when image generation is enabled. Paid books allow up to three chapter rewrite requests per chapter, 50 generation jobs and 80 provider attempts per book, with daily safety limits. No subscription is created.",
            "ينشئ الاستوديو مسودّات معرفية بمساعدة الذكاء الاصطناعي وملفات منسّقة. يتضمن الحساب المجاني فهرسًا وفصلًا تجريبيًا واحدًا. يفتح رصيد كتاب واحد كتابًا من 3 إلى 10 فصول مع التصدير وحتى صورتَي غلاف عند تفعيل الصور. يُسمح حتى ثلاث طلبات إعادة كتابة لكل فصل و50 مهمة توليد و80 محاولة اتصال بالنموذج لكل كتاب، مع حدود استخدام يومية. لا يوجد اشتراك تلقائي.",
            "Studion skapar AI-assisterade faktaboksutkast och formaterade exporter. Ett gratiskonto omfattar en disposition och ett provkapitel. En bokkredit låser upp en bok med 3–10 kapitel, export och upp till två omslagsbilder när bildgenerering är aktiverad. Betalda böcker tillåter upp till tre omskrivningar per kapitel, 50 genereringsjobb och 80 leverantörsanrop per bok, med dagliga gränser. Ingen prenumeration skapas.",
          ),
        ],
        [
          tr(
            locale,
            "Your responsibility and rights",
            "مسؤوليتك وحقوقك",
            "Ditt ansvar och dina rättigheter",
          ),
          tr(
            locale,
            "Use only input material you are entitled to use. Review every draft for accuracy, originality and suitability. AI output may be inaccurate or similar to other output. No earnings, publication acceptance, copyright eligibility or exclusive rights are promised. Do not use the service for fraud, exploitation, illegal instructions or infringement. Commercial use of your exported work is permitted to the extent the operator can grant it, without limiting third-party rights. You must follow the rules of your publishing platform.",
            "استخدم مواد تملك حق استخدامها. راجع دقة كل مسودّة وأصالتها وملاءمتها. قد تكون مخرجات الذكاء الاصطناعي غير دقيقة أو مشابهة لمخرجات أخرى. لا نضمن الدخل أو قبول النشر أو استحقاق حقوق مؤلف أو الحصرية. تُمنع الاستخدامات الاحتيالية والاستغلالية وغير القانونية وانتهاك الحقوق. يُسمح بالاستخدام التجاري ضمن الحقوق التي يستطيع المشغّل منحها ودون المساس بحقوق الآخرين، مع التزام قواعد منصة النشر.",
            "Använd endast underlag du har rätt till. Granska varje utkast för korrekthet, originalitet och lämplighet. AI-resultat kan vara felaktiga eller likna andra resultat. Inga intäkter, godkänd publicering, upphovsrätt eller exklusiva rättigheter utlovas. Bedrägeri, utnyttjande, olagliga instruktioner och intrång är förbjudna. Kommersiell användning tillåts i den utsträckning operatören kan medge detta, utan att begränsa tredje parts rättigheter. Följ din publiceringsplattforms regler.",
          ),
        ],
        [
          tr(
            locale,
            "Payment and delivery",
            "الدفع والتسليم",
            "Betalning och leverans",
          ),
          tr(
            locale,
            "Checkout displays the final price and applicable tax. Credits are delivered after verified payment, which may take a short time. A credit is assigned to a book when paid generation is requested; a failed attempt does not require buying that book again. Refunds and chargebacks reverse the related credit allocation. If credits were already used, the balance may become negative. Contact support if delivery fails. Mandatory consumer rights remain unaffected. The digital-delivery consent shown before checkout does not remove rights that cannot legally be waived.",
            "تُعرض التكلفة النهائية والضرائب عند الدفع. يُضاف الرصيد بعد التحقق من الدفع وقد يستغرق ذلك وقتًا قصيرًا. يُخصّص الرصيد لكتاب عند طلب التوليد المدفوع؛ لا تحتاج لشراء الكتاب مجددًا إذا فشلت محاولة التوليد. يعكس ردّ المال أو الاعتراض على الدفع تخصيص الرصيد، وقد يصبح الرصيد سالبًا إذا استُخدم مسبقًا. تواصل مع الدعم إذا لم تُسلَّم الخدمة. تظل حقوق المستهلك الإلزامية محفوظة ولا تلغي موافقة التسليم الرقمي الحقوق التي لا يجوز التنازل عنها قانونًا.",
            "Kassan visar slutpris och tillämplig skatt. Krediter levereras efter verifierad betalning, vilket kan ta en kort stund. En kredit kopplas till boken när betald generering begärs; ett misslyckat försök kräver inget nytt köp för samma bok. Återbetalningar och återkrav återför krediter. Om de redan använts kan saldot bli negativt. Kontakta support vid leveransfel. Tvingande konsumenträttigheter påverkas inte. Samtycket till digital leverans tar inte bort rättigheter som inte lagligen får avtalas bort.",
          ),
        ],
      ];
  return (
    <>
      <Header locale={locale} />
      <main id="main" className="container legal-page">
        <div className="eyebrow">EBOOK STUDIO</div>
        <h1>{privacy ? t.privacy : t.terms}</h1>
        {sections.map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
        <section>
          <h2>{t.support}</h2>
          <p>{process.env.OPERATOR_NAME || "StartaWebb — Ebook Studio"}</p>
          {process.env.SUPPORT_EMAIL ? (
            <a href={`mailto:${process.env.SUPPORT_EMAIL}`}>
              {process.env.SUPPORT_EMAIL}
            </a>
          ) : (
            <a href="https://startawebb.se">startawebb.se</a>
          )}
        </section>
      </main>
      <Footer locale={locale} />
    </>
  );
}
