import type { IntentId } from "@sam/protocol";
import { readWorkspaceText } from "./workspace.js";

export type DraftFile = { path: string; content: string };

const ACCENTS = ["#8c3a2f", "#1f4d3a", "#1e3a5f", "#6a4b2b", "#24312c"];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function accent(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function titleFrom(text: string, projectName: string) {
  const cleaned = text
    .replace(/دروست\s*بکە[یت]?|تکایە|please|build me|create a|create/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const line = cleaned.split(/[.\n؟?]/)[0]?.trim() ?? "";
  if (line.length >= 3 && line.length <= 72) return line;
  return projectName;
}

function kindOf(text: string): "python" | "api" | "shop" | "site" {
  if (/python|پایتۆن|\.py\b/i.test(text)) return "python";
  if (/\bapi\b|سێرڤەر|backend|endpoint/i.test(text)) return "api";
  if (/فرۆش|shop|store|کاڵا|بەرهەم|market/i.test(text)) return "shop";
  return "site";
}

function page(input: {
  projectName: string;
  title: string;
  lead: string;
  kurdish: boolean;
  shop: boolean;
}) {
  const dir = input.kurdish ? "rtl" : "ltr";
  const lang = input.kurdish ? "ku" : "en";
  const color = accent(input.projectName);
  const products = input.shop
    ? [
        ["01", input.kurdish ? "هەڵبژاردە" : "Selection", input.lead],
        ["02", input.kurdish ? "ڕۆژانە" : "Daily", input.kurdish ? "ئامادەیە بۆ داواکردن." : "Ready to order."],
        ["03", input.kurdish ? "دیاری" : "Gift", input.kurdish ? "پاکەتێکی بچووک بۆ ناردن." : "A small pack to send."],
      ]
    : [];
  const productHtml = products
    .map(
      ([num, name, copy]) =>
        `<article><span>${num}</span><h3>${escapeHtml(name)}</h3><p>${escapeHtml(copy)}</p></article>`,
    )
    .join("");
  const shopBlock = input.shop
    ? `<section class="grid" id="work"><h2>${input.kurdish ? "لیست" : "List"}</h2>${productHtml}</section>`
    : `<section id="work"><h2>${input.kurdish ? "کارەکە" : "The work"}</h2><p class="lead">${escapeHtml(input.lead)}</p></section>`;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body style="--accent:${color}">
  <header class="bar">
    <strong>${escapeHtml(input.projectName)}</strong>
    <nav>
      <a href="#work">${input.kurdish ? "کار" : "Work"}</a>
      <a href="#note">${input.kurdish ? "تێبینی" : "Note"}</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <p class="kicker">SAM AI</p>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="lead">${escapeHtml(input.lead)}</p>
    </section>
    ${shopBlock}
    <section id="note">
      <h2>${input.kurdish ? "لەم وۆرکسپەیسە" : "In this workspace"}</h2>
      <p>${input.kurdish ? "ئەم پەڕەیە لەسەر سێرڤەری SAM نووسراوە. مۆدێلی دوور کاتێک دەبەسترێت هەمان فایلەکان دەستکاری دەکات." : "SAM wrote this page on the server workspace. A remote model edits these same files once it is connected."}</p>
      <form class="note-form">
        <label>${input.kurdish ? "پەیام" : "Message"}<input name="message" required /></label>
        <button type="submit">${input.kurdish ? "تۆمار" : "Save locally"}</button>
        <p class="thanks" hidden>${input.kurdish ? "لەم پەڕەیەدا هەڵگیرا." : "Kept in this page."}</p>
      </form>
    </section>
  </main>
  <footer><span id="year"></span> ${escapeHtml(input.projectName)}</footer>
  <script src="main.js"></script>
</body>
</html>
`;
}

const css = `*{box-sizing:border-box}html,body{margin:0}body{font-family:Georgia,"Segoe UI",serif;background:#f3efe6;color:#1c1915;line-height:1.5}.bar{display:flex;justify-content:space-between;align-items:center;padding:18px 8vw;border-bottom:1px solid #ddd6c8}.bar strong{letter-spacing:.14em;text-transform:uppercase;font-family:"Segoe UI",sans-serif;font-size:13px}nav{display:flex;gap:16px}a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}a:hover{border-color:var(--accent)}main{padding:8vh 8vw;display:grid;gap:64px}.hero h1{font-size:clamp(40px,7vw,84px);line-height:.95;margin:8px 0 16px;max-width:14ch}.kicker{letter-spacing:.18em;text-transform:uppercase;font-family:"Segoe UI",sans-serif;font-size:12px;color:var(--accent)}.lead{max-width:38rem;font-size:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.grid article{border-top:2px solid var(--accent);padding-top:12px}h2,h3{font-weight:500}form{display:grid;gap:10px;max-width:360px}input,button{font:inherit;padding:10px 12px}button{background:var(--accent);color:#f3efe6;border:0}footer{padding:24px 8vw 40px;color:#6d675c;font-family:"Segoe UI",sans-serif;font-size:13px}@media(max-width:700px){.bar{padding:16px 20px}main{padding:40px 20px}}`;

const js = `document.querySelector("#year").textContent = String(new Date().getFullYear());
const form = document.querySelector(".note-form");
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const thanks = form.querySelector(".thanks");
  if (thanks) thanks.hidden = false;
  form.reset();
});
`;

function pythonFiles(title: string, lead: string): DraftFile[] {
  return [
    {
      path: "main.py",
      content: `"""${title.replaceAll('"""', "")}"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description=${JSON.stringify(title)})
    parser.add_argument("text", nargs="*", help="Input text")
    args = parser.parse_args()
    message = " ".join(args.text).strip() or ${JSON.stringify(lead)}
    print(message)


if __name__ == "__main__":
    main()
`,
    },
    {
      path: "README.md",
      content: `# ${title}\n\n${lead}\n`,
    },
  ];
}

function apiFiles(title: string, lead: string): DraftFile[] {
  return [
    {
      path: "server.mjs",
      content: `import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: ${JSON.stringify(title)} }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ name: ${JSON.stringify(title)}, note: ${JSON.stringify(lead)} }));
});

server.listen(3000, "127.0.0.1", () => {
  console.log("listening on http://127.0.0.1:3000");
});
`,
    },
    {
      path: "README.md",
      content: `# ${title}\n\n${lead}\n\n\`\`\`powershell\nnode server.mjs\n\`\`\`\n`,
    },
  ];
}

export function parseFileBlocks(text: string): DraftFile[] {
  const files: DraftFile[] = [];
  const pattern = /FILE:\s*([^\n]+)\n```[^\n]*\n([\s\S]*?)```/g;
  for (const match of text.matchAll(pattern)) {
    const path = match[1].trim().replaceAll("\\", "/");
    if (!path || path.startsWith("/") || path.includes("..")) continue;
    files.push({ path, content: match[2].replace(/\n$/, "") });
  }
  return files;
}

export function draftProject(input: {
  projectId: string;
  projectName: string;
  text: string;
  intent: IntentId;
  kurdish: boolean;
}): DraftFile[] {
  const title = titleFrom(input.text, input.projectName);
  const lead = input.text.trim();
  if (input.intent === "fix") {
    try {
      const current = readWorkspaceText(input.projectId, "index.html");
      if (current.includes('class="lead"')) {
        const next = current.replace(
          /<p class="lead">[\s\S]*?<\/p>/,
          `<p class="lead">${escapeHtml(lead)}</p>`,
        );
        return [{ path: "index.html", content: next }];
      }
    } catch {
      // No page yet. Fall through and create one.
    }
  }
  const kind = kindOf(input.text);
  if (kind === "python") return pythonFiles(title, lead);
  if (kind === "api") return apiFiles(title, lead);
  return [
    {
      path: "index.html",
      content: page({
        projectName: input.projectName,
        title,
        lead,
        kurdish: input.kurdish,
        shop: kind === "shop",
      }),
    },
    { path: "styles.css", content: css },
    { path: "main.js", content: js },
  ];
}

export function localBuildNote(kurdish: boolean, paths: string[]) {
  const list = paths.join(", ");
  if (kurdish) {
    return (
      `SAM ئەم فایلانەی نووسی لە وۆرکسپەیسی سێرڤەر: ${list}.\n\n` +
      "پێشبینین، git diff و لیستی فایل لە لای ڕاستن. " +
      "مێشکی مۆدێل بەردەست نەبوو، بۆیە ئەم دەستپێکە لەسەر سێرڤەر دروست کرا."
    );
  }
  return (
    `SAM wrote these files on the server workspace: ${list}.\n\n` +
    "Preview, git diff, and the file list are on the right. " +
    "The model brain was unavailable, so this draft was built on the server."
  );
}
