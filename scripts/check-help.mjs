// Fails if an admin page has no "i" help button. Run with `pnpm check:help`.
// A page passes if it renders <PageTitle> (whose `help` prop TypeScript requires) or <InfoButton>.
// Public, customer-facing pages (no login, no help) go in PUBLIC below.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_DIR = join(import.meta.dirname, "..", "src", "app");

/** Routes customers see. Their help lives on the admin screen that sends them. */
const PUBLIC = new Set([]);

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

const missing = [];
for (const file of pages(APP_DIR)) {
  const route = "/" + relative(APP_DIR, file).split(sep).slice(0, -1).join("/");
  if (PUBLIC.has(route)) continue;
  const source = readFileSync(file, "utf8");
  if (!/<PageTitle\b/.test(source) && !/<InfoButton\b/.test(source)) missing.push(route);
}

if (missing.length) {
  console.error(`No "i" help on ${missing.length} page(s):\n${missing.map((r) => `  ${r}`).join("\n")}`);
  console.error('Add <PageTitle help={help.…}> or <InfoButton help={help.…} />, with an entry in src/content/help.');
  process.exit(1);
}
console.log(`Help check: every admin page has an "i" button.`);
