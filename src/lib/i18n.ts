export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
export const isLocale = (s: string | undefined): s is Locale => !!s && (LOCALES as readonly string[]).includes(s);

const en = {
    siteName: "Today Jobs",
    tagline: "Find your next job today",
    searchPlaceholder: "Job title, skill or company",
    locationPlaceholder: "City or country",
    remoteOnly: "Remote only",
    search: "Search",
    results: "jobs found",
    noResults: "No jobs matched your search.",
    didYouMean: "No exact matches — showing similar results.",
    apply: "Apply on employer site",
    postedOn: "Posted",
    remote: "Remote",
    backToResults: "Back to results",
    language: "العربية",
    jobExpired: "This job is no longer available.",
    next: "Next",
    prev: "Previous",
    consentText: "We use optional cookies for anonymous analytics and advertising. Nothing optional loads unless you accept.",
    consentAccept: "Accept",
    consentReject: "Reject",
} as const;

const ar: Record<keyof typeof en, string> = {
    siteName: "وظائف اليوم",
    tagline: "اعثر على وظيفتك القادمة اليوم",
    searchPlaceholder: "المسمى الوظيفي أو المهارة أو الشركة",
    locationPlaceholder: "المدينة أو الدولة",
    remoteOnly: "عن بُعد فقط",
    search: "بحث",
    results: "وظيفة",
    noResults: "لا توجد وظائف مطابقة لبحثك.",
    didYouMean: "لا توجد نتائج مطابقة تمامًا — نعرض نتائج مشابهة.",
    apply: "قدّم عبر موقع صاحب العمل",
    postedOn: "نُشرت",
    remote: "عن بُعد",
    backToResults: "العودة إلى النتائج",
    language: "English",
    jobExpired: "هذه الوظيفة لم تعد متاحة.",
    next: "التالي",
    prev: "السابق",
    consentText: "نستخدم ملفات تعريف ارتباط اختيارية للتحليلات المجهولة والإعلانات. لن يتم تحميل أي شيء اختياري ما لم توافق.",
    consentAccept: "موافق",
    consentReject: "رفض",
};

export type Dict = Record<keyof typeof en, string>;
export const t = (l: Locale): Dict => (l === "ar" ? ar : en);

/** English is unprefixed; Arabic lives under /ar. */
export const localePath = (l: Locale, path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return l === DEFAULT_LOCALE ? p : p === "/" ? `/${l}` : `/${l}${p}`;
};
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const m = pathname.match(/^\/(ar)(\/.*)?$/);
  return m ? { locale: m[1] as Locale, path: m[2] ?? "/" } : { locale: DEFAULT_LOCALE, path: pathname };
}
