export type RiskDecision =
  | { blocked: false }
  | { blocked: true; reason: string };

const BLOCKED: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /ransomware|keylogger|infostealer|credential stealer|steal(ing)? passwords/i,
    reason: "SAM will not build malware or credential theft tools.",
  },
  {
    pattern: /فیشینگ|phishing kit|steal (the )?session|unauthorized access|hack into|exploit (this|the) (site|server|account)/i,
    reason: "SAM will not help break into systems or accounts.",
  },
  {
    pattern: /دزینی پاسۆرد|داخڵبوون بەبێ مۆڵەت|هێرش بکە/i,
    reason: "SAM یارمەتی هێرش و دزینی زانیاری نادات.",
  },
];

export function assessRisk(text: string): RiskDecision {
  for (const rule of BLOCKED) {
    if (rule.pattern.test(text)) return { blocked: true, reason: rule.reason };
  }
  return { blocked: false };
}

export function needsConfirmation(text: string) {
  return /drop database|rm -rf|force push|git reset --hard|delete all files|هەموو فایلەکان بسڕەوە/i.test(
    text,
  );
}
