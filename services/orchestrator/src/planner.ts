import type { AgentId, IntentId, PlanStep } from "@sam/protocol";

function step(
  id: string,
  agent: AgentId,
  title: string,
  dependsOn: string[] = [],
): PlanStep {
  return { id, agent, title, dependsOn };
}

export function buildPlan(intent: IntentId, kurdish: boolean): PlanStep[] {
  if (intent === "deploy") {
    return [
      step("d1", "devops", kurdish ? "دۆخی بیلد و git بپشکنە" : "Inspect build and git state"),
      step("d2", "reviewer", kurdish ? "پشتڕاستکردنەوە پێش بڵاوکردنەوە" : "Confirm before deploy", ["d1"]),
      step("d3", "devops", kurdish ? "بڵاوکردنەوە لەسەر وۆرکەری دوور" : "Deploy on the remote worker", ["d2"]),
      step("d4", "memory", kurdish ? "ئەنجامەکە تۆمار بکە" : "Record the outcome", ["d3"]),
    ];
  }

  if (intent === "research" || intent === "explain") {
    return [
      step("r1", "researcher", kurdish ? "سەرچاوە و کۆنتێکست کۆبکەرەوە" : "Collect sources and context"),
      step("r2", "architect", kurdish ? "وەڵامەکە ڕێکبخە" : "Structure the answer", ["r1"]),
      step("r3", "reviewer", kurdish ? "بپشکنە وەڵامەکە پرسیارەکە دەگرێتەوە" : "Check the answer covers the question", ["r2"]),
      step("r4", "memory", kurdish ? "ئەنجامە بەسوودەکان هەڵبگرە" : "Keep the useful findings", ["r3"]),
    ];
  }

  if (intent === "fix") {
    return [
      step("f1", "researcher", kurdish ? "هەڵەکە و شوێنەکەی دیاری بکە" : "Locate the failure"),
      step("f2", "architect", kurdish ? "نەخشەی پەیوەندی چاککردن دابنێ" : "Set the fix dependency graph", ["f1"]),
      step("f3", "coder", kurdish ? "گۆڕانکارییەکە بنووسە" : "Write the change", ["f2"]),
      step("f4", "tester", kurdish ? "تاقیکردنەوە لەسەر وۆرکەری دوور" : "Run tests on the remote worker", ["f3"]),
      step("f5", "reviewer", kurdish ? "بەراورد لەگەڵ داواکاری" : "Compare with the request", ["f3"]),
      step("f6", "memory", kurdish ? "هۆکار و چارەسەر تۆمار بکە" : "Record cause and fix", ["f5"]),
    ];
  }

  return [
    step("b1", "researcher", kurdish ? "سنووری پڕۆژەکە بپشکنە" : "Check project constraints"),
    step("b2", "architect", kurdish ? "پلان و نەخشەی پەیوەندی" : "Plan and dependency graph", ["b1"]),
    step("b3", "coder", kurdish ? "جێبەجێکردن" : "Implement", ["b2"]),
    step("b4", "reviewer", kurdish ? "پێداچوونەوەی کۆتایی" : "Final review", ["b3"]),
    step("b5", "tester", kurdish ? "تاقیکردنەوە کاتێک وۆرکەر هەڵکەوت" : "Test when the worker is attached", ["b3"]),
    step("b6", "memory", kurdish ? "بڕیارەکان هەڵبگرە" : "Store the decisions", ["b4"]),
  ];
}
