import type { Locale } from "./domain";
import { tr } from "./i18n";
export function examples(l: Locale) {
  return [
    {
      kind: "guide",
      style: "sage",
      title: tr(
        l,
        "A calmer kind of productivity",
        "إنجاز أكثر، بهدوء",
        "En lugnare produktivitet",
      ),
      subtitle: tr(
        l,
        "Make room for the work that matters",
        "مساحة للعمل الذي يستحق",
        "Ge plats åt det som spelar roll",
      ),
      chapter: tr(l, "Start with less", "ابدأ بأقل", "Börja med mindre"),
      content: tr(
        l,
        "## Choose one meaningful outcome\n\nA useful day does not need a long list. Before opening your inbox, write down one outcome that would make the day feel worthwhile. Make it small enough to complete and specific enough to recognize.\n\nInstead of “work on the website,” try “write the opening paragraph of the services page.” A visible finish line makes starting easier.\n\n## Protect a small block of time\n\nSet aside twenty minutes. Put your phone out of reach and close the tabs you do not need. You are not designing a perfect routine; you are creating enough space to begin.\n\n- Choose a task with a clear finish.\n- Gather only what you need.\n- Stop to notice what helped.\n\nThe point is not to fit more into your day. It is to give your attention a direction.",
        "## اختر نتيجة واحدة ذات معنى\n\nاليوم المفيد لا يحتاج إلى قائمة طويلة. قبل فتح بريدك، اكتب نتيجة واحدة تجعل يومك ذا قيمة. اجعلها صغيرة بما يكفي لإنجازها، وواضحة بما يكفي لتعرف أنك أتممتها.\n\nبدلًا من «العمل على الموقع»، جرّب «كتابة الفقرة الافتتاحية لصفحة الخدمات». وجود نهاية واضحة يجعل البداية أسهل.\n\n## احمِ وقتًا صغيرًا\n\nخصّص عشرين دقيقة. أبعد هاتفك وأغلق النوافذ التي لا تحتاجها. أنت لا تصمّم روتينًا مثاليًا، بل تمنح نفسك مساحة كافية للبداية.\n\n- اختر مهمة ذات نهاية واضحة.\n- اجمع ما تحتاجه فقط.\n- لاحظ ما ساعدك على التركيز.\n\nالهدف ليس حشو يومك بمهام أكثر، بل منح انتباهك اتجاهًا واضحًا.",
        "## Välj ett meningsfullt resultat\n\nEn användbar dag behöver inte en lång lista. Innan du öppnar inkorgen, skriv ner ett resultat som skulle göra dagen värdefull. Gör det tillräckligt litet för att slutföra och konkret nog att känna igen.\n\nI stället för ”jobba på hemsidan”, prova ”skriv inledningen till tjänstesidan”. Ett tydligt mål gör det lättare att börja.\n\n## Skydda en liten stund\n\nAvsätt tjugo minuter. Lägg undan mobilen och stäng flikar du inte behöver. Du bygger ingen perfekt rutin; du skapar utrymme att börja.\n\n- Välj en uppgift med ett tydligt slut.\n- Samla bara det du behöver.\n- Lägg märke till vad som hjälpte.\n\nPoängen är inte att fylla dagen med mer. Det är att ge uppmärksamheten en riktning.",
      ),
    },
    {
      kind: "ebook",
      style: "cobalt",
      title: tr(
        l,
        "The art of starting small",
        "فن البدايات الصغيرة",
        "Konsten att börja smått",
      ),
      subtitle: tr(
        l,
        "A little progress, every day",
        "تقدّم صغير، كل يوم",
        "Små framsteg, varje dag",
      ),
      chapter: tr(
        l,
        "Make the first step visible",
        "اجعل الخطوة الأولى واضحة",
        "Gör första steget synligt",
      ),
      content: tr(
        l,
        "## An idea needs a first action\n\nBig projects often stay in our heads because the first step is unclear. “Write a book” is a goal. “List three questions my reader asks” is an action you can take today.\n\nChoose a first action that produces something visible: a paragraph, a sketch, or a short conversation. It should teach you something about the next step.\n\n## Let the reader guide you\n\nThink of one person who could benefit from what you know. What do they struggle with? What have they already tried? Write for that person before trying to reach everyone.\n\nA useful beginning does not answer every question. It gives the reader a reason to turn the page.",
        "## الفكرة تحتاج إلى فعل أول\n\nتبقى المشاريع الكبيرة في أذهاننا لأن خطوتها الأولى غير واضحة. «كتابة كتاب» هدف، أما «تحديد ثلاثة أسئلة يسألها قارئي» ففعل يمكنك إنجازه اليوم.\n\nاختر فعلًا ينتج شيئًا ملموسًا: فقرة أو رسمًا أوليًا أو محادثة قصيرة. ينبغي أن يعلّمك شيئًا عن خطوتك التالية.\n\n## دع القارئ يوجّهك\n\nتخيّل شخصًا واحدًا قد يستفيد من معرفتك. ما الذي يصعب عليه؟ وماذا جرّب من قبل؟ اكتب لهذا الشخص قبل محاولة الوصول إلى الجميع.\n\nالبداية المفيدة لا تجيب عن كل الأسئلة. إنها تمنح القارئ سببًا ليقلب الصفحة.",
        "## En idé behöver en första handling\n\nStora projekt stannar ofta i huvudet för att första steget är oklart. ”Skriv en bok” är ett mål. ”Lista tre frågor min läsare ställer” är en handling du kan göra i dag.\n\nVälj ett steg som skapar något synligt: ett stycke, en skiss eller ett kort samtal. Det ska lära dig något om nästa steg.\n\n## Låt läsaren visa vägen\n\nTänk på en person som kan ha nytta av det du vet. Vad är svårt för dem? Vad har de redan provat? Skriv för den personen innan du försöker nå alla.\n\nEn användbar början svarar inte på alla frågor. Den ger läsaren en anledning att vända blad.",
      ),
    },
    {
      kind: "workbook",
      style: "clay",
      title: tr(
        l,
        "Your next good idea",
        "فكرتك الجيدة القادمة",
        "Din nästa bra idé",
      ),
      subtitle: tr(
        l,
        "A workbook for curious minds",
        "تمارين للأذهان الفضولية",
        "En arbetsbok för nyfikna",
      ),
      chapter: tr(
        l,
        "Find a problem worth solving",
        "اعثر على مشكلة تستحق الحل",
        "Hitta ett problem att lösa",
      ),
      content: tr(
        l,
        "## Exercise 1: Notice a small friction\n\nThink about the last week. When did a simple task take longer than you expected? Describe what happened without proposing a solution yet.\n\n**The situation:** ____________________\n\n**Who experienced it:** ____________________\n\n**What made it difficult:** ____________________\n\n## Exercise 2: Ask before building\n\nFind someone who has faced the same problem. Ask them to describe the last time it happened. Listen for what they actually did, not what they think they might do.\n\n- What did you try?\n- What did it cost in time or effort?\n- What would you like to do differently?\n\n## Reflection\n\nWrite down one assumption that changed after the conversation. Choose one small thing to test next.",
        "## التمرين الأول: لاحظ عائقًا صغيرًا\n\nفكّر في الأسبوع الماضي. متى استغرقت مهمة بسيطة وقتًا أطول مما توقّعت؟ صف ما حدث دون اقتراح حل الآن.\n\n**الموقف:** ____________________\n\n**من واجهه:** ____________________\n\n**ما الذي جعله صعبًا:** ____________________\n\n## التمرين الثاني: اسأل قبل أن تبني\n\nابحث عن شخص واجه المشكلة نفسها. اطلب منه وصف آخر مرة حدثت فيها. استمع إلى ما فعله فعلًا، وليس إلى ما يتصوّر أنه قد يفعله.\n\n- ماذا جرّبت؟\n- كم كلّفك ذلك من وقت أو جهد؟\n- ما الذي تود فعله بطريقة مختلفة؟\n\n## تأمّل\n\nدوّن افتراضًا واحدًا تغيّر بعد المحادثة. اختر خطوة صغيرة تختبرها لاحقًا.",
        "## Övning 1: Lägg märke till ett litet hinder\n\nTänk på den senaste veckan. När tog en enkel uppgift längre tid än väntat? Beskriv vad som hände utan att föreslå en lösning än.\n\n**Situationen:** ____________________\n\n**Vem som upplevde den:** ____________________\n\n**Vad som gjorde det svårt:** ____________________\n\n## Övning 2: Fråga innan du bygger\n\nHitta någon som mött samma problem. Be dem beskriva senaste gången det hände. Lyssna på vad de faktiskt gjorde, inte vad de tror att de skulle göra.\n\n- Vad provade du?\n- Vad kostade det i tid eller arbete?\n- Vad skulle du vilja göra annorlunda?\n\n## Reflektion\n\nSkriv ner ett antagande som förändrades efter samtalet. Välj något litet att testa härnäst.",
      ),
    },
  ];
}
