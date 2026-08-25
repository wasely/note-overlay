import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(process.argv[2] || "");
const ownRepo = path.resolve(process.argv[3] || "C:/Code/skills");

if (!process.argv[2] || !fs.existsSync(sourceRoot)) {
  throw new Error("Pass the directory containing the checked-out upstream skill repositories.");
}

function read(relativePath, root = sourceRoot) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing source file: ${absolutePath}`);
  return fs.readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n").trimEnd();
}

function entry(name, category, sourceUrl, sourcePath, options = {}) {
  return {
    id: `library-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    name,
    category,
    body: read(sourcePath, options.root),
    source_url: sourceUrl,
    ownership: options.ownership || "other",
    pinned: false,
  };
}

const catalog = [
  entry("1", "00 · My skills", "https://github.com/blixvip/skills/blob/main/1/SKILL.md", "1/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("2", "00 · My skills", "https://github.com/blixvip/skills/blob/main/2/SKILL.md", "2/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("3", "00 · My skills", "https://github.com/blixvip/skills/blob/main/3/SKILL.md", "3/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("4", "00 · My skills", "https://github.com/blixvip/skills/blob/main/4/SKILL.md", "4/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("5", "00 · My skills", "https://github.com/blixvip/skills/blob/main/5/SKILL.md", "5/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("asap", "00 · My skills", "https://github.com/blixvip/skills/blob/main/asap/SKILL.md", "asap/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("backbefore", "00 · My skills", "https://github.com/blixvip/skills/blob/main/backbefore/SKILL.md", "backbefore/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("components", "00 · My skills", "https://github.com/blixvip/skills/blob/main/components/SKILL.md", "components/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("github", "00 · My skills", "https://github.com/blixvip/skills/blob/main/github/SKILL.md", "github/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("huh", "00 · My skills", "https://github.com/blixvip/skills/blob/main/huh/SKILL.md", "huh/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("instant", "00 · My skills", "https://github.com/blixvip/skills/blob/main/instant/SKILL.md", "instant/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("quick-context", "00 · My skills", "https://github.com/blixvip/skills/blob/main/quick-context/SKILL.md", "quick-context/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("shader-ui", "00 · My skills", "https://github.com/blixvip/skills/blob/main/shader-ui/SKILL.md", "shader-ui/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("ui-intergrity", "00 · My skills", "https://github.com/blixvip/skills/blob/main/ui-intergrity/SKILL.md", "ui-intergrity/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("motion-plan", "10 · Editing", "https://github.com/blixvip/skills/blob/main/motion-plan/SKILL.md", "motion-plan/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("motion-design", "10 · Editing", "https://github.com/blixvip/skills/blob/main/motion-design/SKILL.md", "motion-design/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("motion-animate", "10 · Editing", "https://github.com/blixvip/skills/blob/main/motion-animate/SKILL.md", "motion-animate/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("motion-pipeline", "10 · Editing", "https://github.com/blixvip/skills/blob/main/motion-pipeline/SKILL.md", "motion-pipeline/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("motion-assets", "10 · Editing", "https://github.com/blixvip/skills/blob/main/motion-assets/SKILL.md", "motion-assets/SKILL.md", { root: ownRepo, ownership: "mine" }),
  entry("ae-extendscript", "10 · Editing", "https://github.com/blixvip/skills/blob/main/ae-extendscript/SKILL.md", "ae-extendscript/SKILL.md", { root: ownRepo, ownership: "mine" }),

  entry("Grill-with-docs", "01 · Planning", "https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md", "mattpocock-skills/skills/engineering/grill-with-docs/SKILL.md"),
  entry("To-spec", "01 · Planning", "https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md", "mattpocock-skills/skills/engineering/to-spec/SKILL.md"),
  entry("Grilling", "01 · Planning", "https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md", "mattpocock-skills/skills/productivity/grilling/SKILL.md"),
  entry("Prototype", "01 · Planning", "https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md", "mattpocock-skills/skills/engineering/prototype/SKILL.md"),

  entry("Improve Codebase Architecture", "02 · Code Format", "https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md", "mattpocock-skills/skills/engineering/improve-codebase-architecture/SKILL.md"),
  entry("Code Simplification", "02 · Code Format", "https://github.com/addyosmani/agent-skills/blob/main/skills/code-simplification/SKILL.md", "addyosmani-agent-skills/skills/code-simplification/SKILL.md"),
  entry("Code Review & Quality", "02 · Code Format", "https://github.com/addyosmani/agent-skills/blob/main/skills/code-review-and-quality/SKILL.md", "addyosmani-agent-skills/skills/code-review-and-quality/SKILL.md"),

  entry("frontend-design", "03 · UI", "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md", "anthropics-skills/skills/frontend-design/SKILL.md"),
  entry("frontend-ui-engineering", "03 · UI", "https://github.com/addyosmani/agent-skills/blob/main/skills/frontend-ui-engineering/SKILL.md", "addyosmani-agent-skills/skills/frontend-ui-engineering/SKILL.md"),
  entry("web-design-guidelines", "03 · UI", "https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md", "vercel-agent-skills/skills/web-design-guidelines/SKILL.md"),

  entry("SecOpsAgentKit", "04 · Safety", "https://github.com/AgentSecOps/SecOpsAgentKit/blob/main/README.md", "secops-agent-kit/README.md"),
  entry("AI Security Arsenal", "04 · Safety", "https://github.com/hardw00t/ai-security-arsenal/blob/main/README.md", "ai-security-arsenal/README.md"),
  entry("Superagent Security Skills", "04 · Safety", "https://github.com/superagent-ai/skills/blob/main/skills/superagent/SKILL.md", "superagent-skills/skills/superagent/SKILL.md"),
  entry("Security & Hardening", "04 · Safety", "https://github.com/addyosmani/agent-skills/blob/main/skills/security-and-hardening/SKILL.md", "addyosmani-agent-skills/skills/security-and-hardening/SKILL.md"),
  entry("SkillTotal", "04 · Safety", "https://github.com/pezhik/skilltotal/blob/main/README.md", "skilltotal/README.md"),

  entry("Impeccable", "05 · Anti-Slop — Frontend / UI", "https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/SKILL.md", "impeccable/plugin/skills/impeccable/SKILL.md"),
  entry("Frontend Design Principles", "05 · Anti-Slop — Frontend / UI", "https://github.com/joshuadavidthomas/agent-skills/blob/main/frontend-design-principles/SKILL.md", "jdt-agent-skills/frontend-design-principles/SKILL.md"),
  entry("Frontend Design 2.0", "05 · Anti-Slop — Frontend / UI", "https://github.com/PracticalSwan/agent-skills/blob/main/frontend-design/SKILL.md", "practicalswan-agent-skills/frontend-design/SKILL.md"),

  entry("Test-Driven Development", "06 · Anti-Slop — Backend / Code", "https://github.com/addyosmani/agent-skills/blob/main/skills/test-driven-development/SKILL.md", "addyosmani-agent-skills/skills/test-driven-development/SKILL.md"),
  entry("Debugging & Error Recovery", "06 · Anti-Slop — Backend / Code", "https://github.com/addyosmani/agent-skills/blob/main/skills/debugging-and-error-recovery/SKILL.md", "addyosmani-agent-skills/skills/debugging-and-error-recovery/SKILL.md"),

  entry("Anti-Slop Writing", "07 · Anti-Slop — Text / Writing", "https://github.com/adewale/anti-slop-writing/blob/main/skills/anti-slop-writing/SKILL.md", "anti-slop-writing/skills/anti-slop-writing/SKILL.md"),
  entry("Writing Clearly & Concisely", "07 · Anti-Slop — Text / Writing", "https://github.com/obra/the-elements-of-style/blob/main/skills/writing-clearly-and-concisely/SKILL.md", "elements-of-style/skills/writing-clearly-and-concisely/SKILL.md"),
  entry("Red Pen", "07 · Anti-Slop — Text / Writing", "https://github.com/richtabor/agent-skills/blob/main/skills/red-pen/SKILL.md", "richtabor-agent-skills/skills/red-pen/SKILL.md"),
  entry("Vercel Writing Guidelines", "07 · Anti-Slop — Text / Writing", "https://github.com/vercel-labs/agent-skills/blob/main/skills/writing-guidelines/SKILL.md", "vercel-agent-skills/skills/writing-guidelines/SKILL.md"),

  entry("Agentic QE Fleet", "08 · Caveats Testing", "https://github.com/proffesor-for-testing/agentic-qe/blob/main/assets/skills/agentic-quality-engineering/SKILL.md", "agentic-qe/assets/skills/agentic-quality-engineering/SKILL.md"),
  entry("Schemathesis", "08 · Caveats Testing", "https://github.com/schemathesis/schemathesis/blob/master/README.md", "schemathesis/README.md"),
  entry("Continuous Claude", "08 · Caveats Testing", "https://github.com/AnandChowdhary/continuous-claude/blob/main/README.md", "continuous-claude/README.md"),

  entry("skill-creator", "09 · Skill Creation", "https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md", "anthropics-skills/skills/skill-creator/SKILL.md"),
  entry("agent-skill-creator", "09 · Skill Creation", "https://github.com/FrancyJGLisboa/agent-skill-creator/blob/main/SKILL.md", "agent-skill-creator/SKILL.md"),
  entry("write-a-skill", "09 · Skill Creation", "https://github.com/mattpocock/skills/blob/v1/write-a-skill/SKILL.md", "mattpocock-skills-v1/write-a-skill/SKILL.md"),
];

const outputPath = path.join(projectRoot, "src/main/curated-skills.json");
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.length} complete skill records to ${outputPath}.`);
