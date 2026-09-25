import type { IntentId } from "@sam/protocol";

const KURDISH = /[\u0600-\u06FF]/;

export type Intent = {
  id: IntentId;
  summary: string;
};

export function analyzeIntent(text: string): Intent {
  const t = text.toLowerCase();
  const ku = KURDISH.test(text);

  if (/(deploy|ship|بڵاو|سێرڤەرەکە)/i.test(t)) {
    return {
      id: "deploy",
      summary: ku ? "بڵاوکردنەوەی پڕۆژە" : "Deploy the project",
    };
  }
  if (/(bug|fix|error|هەڵە|چاک)/i.test(t)) {
    return {
      id: "fix",
      summary: ku ? "دۆزینەوە و چاککردنی هەڵە" : "Find and fix a defect",
    };
  }
  if (/(research|docs|compare|بخوێنە|بگەڕێ|لێکۆڵ)/i.test(t)) {
    return {
      id: "research",
      summary: ku ? "کۆکردنەوەی زانیاری" : "Gather references",
    };
  }
  if (/(explain|چی+ە|چۆن کار|what is|how does)/i.test(t)) {
    return {
      id: "explain",
      summary: ku ? "ڕوونکردنەوەی بیرۆکەکە" : "Explain the idea",
    };
  }
  if (/(وێب|website|landing|html|css|react|page)/i.test(t)) {
    return {
      id: "build_web",
      summary: ku ? "دروستکردنی وێبسایت" : "Build a website",
    };
  }
  return {
    id: "build_software",
    summary: ku ? "دروستکردن یان گۆڕینی نەرمەکاڵا" : "Build or change software",
  };
}

export function userWroteKurdish(text: string) {
  return KURDISH.test(text);
}
