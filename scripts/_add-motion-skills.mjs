// One-off: flatten the three new motion skills into single-file SKILL.md
// sources under C:/Code/skills, then insert them into curated-skills.json
// right after motion-animate so the "10 · Editing" group stays contiguous.
import fs from "node:fs";
import path from "node:path";

const SKILL_HOME = "C:/Users/kaigu/.claude/skills";
const OWN_REPO = "C:/Code/skills";
const CATALOG = "C:/Code/note-overlay/src/main/curated-skills.json";
const LETTERS = ["A", "B", "C", "D"];

// reference order = order of first mention in SKILL.md
const SKILLS = [
  { name: "motion-pipeline", refs: ["qc.md", "briefing.md"] },
  { name: "motion-assets", refs: ["sources.md"] },
  { name: "ae-extendscript", refs: ["recipes.md"] },
];

const read = (p) => fs.readFileSync(p, "utf8").replaceAll("\r\n", "\n").trimEnd();

function flatten({ name, refs }) {
  let body = read(path.join(SKILL_HOME, name, "SKILL.md"));
  const appendices = [];

  refs.forEach((file, i) => {
    const letter = LETTERS[i];
    const raw = read(path.join(SKILL_HOME, name, "references", file));
    const title = raw.match(/^#\s+(.*)$/m)[1];
    const rest = raw.replace(/^#\s+.*$/m, "").replace(/^\n+/, "");
    appendices.push(`# Appendix ${letter} \u00b7 ${title}\n\n\n${rest}`);

    // rewrite every in-body pointer at this reference file
    body = body
      .replaceAll("`references/" + file + "`", `Appendix ${letter}`)
      .replaceAll("references/" + file, `Appendix ${letter}`);
  });

  // cross-skill pointers keep their own skill's appendix naming
  body = body.replaceAll(
    "`motion-design/references/anti-slop.md`",
    "the `motion-design` anti-slop checklist"
  );

  if (body.includes("references/")) {
    throw new Error(`${name}: unresolved reference path remains`);
  }
  return [body, ...appendices].join("\n\n---\n\n") + "\n";
}

for (const skill of SKILLS) {
  const out = path.join(OWN_REPO, skill.name, "SKILL.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, flatten(skill));
  console.log(`flattened ${skill.name} -> ${out} (${flatten(skill).length} chars)`);
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const entries = SKILLS.map(({ name }) => ({
  id: `library-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
  name,
  category: "10 \u00b7 Editing",
  body: read(path.join(OWN_REPO, name, "SKILL.md")),
  source_url: `https://github.com/blixvip/skills/blob/main/${name}/SKILL.md`,
  ownership: "mine",
  pinned: false,
}));

const kept = catalog.filter((s) => !entries.some((e) => e.id === s.id));
const at = kept.findIndex((s) => s.id === "library-motion-animate");
if (at < 0) throw new Error("motion-animate anchor not found in catalog");
kept.splice(at + 1, 0, ...entries);

fs.writeFileSync(CATALOG, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`catalog now holds ${kept.length} records`);
