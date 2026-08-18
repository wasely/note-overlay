export const SKILL_STACK_GROUPS = [
  {
    status: "active",
    label: "Core Workflow",
    items: [
      ["GitHub Publisher ($github)", "Prepare truthful docs and repository health files, validate, commit, then safely publish or update GitHub."],
      ["grill-with-docs", "Pressure-test an idea against the repository and build shared vocabulary before planning."],
      ["to-spec", "Turn established conversation and code context into a concrete build specification."],
      ["to-tickets", "Split a specification into dependency-aware, tracer-bullet tickets."],
      ["implement", "Execute specifications or tickets; typecheck often, test narrowly, then run the full suite."],
      ["diagnosing-bugs", "Create one reliable red feedback loop, find the cause, then lock the fix with a regression test."],
      ["tdd", "Use red, green, refactor at a stable seam and produce durable behavior tests."],
      ["code-review", "Review a diff against both repository standards and the originating specification."],
      ["research", "Delegate primary-source reading and save a cited Markdown report in the repository."],
    ],
  },
  {
    status: "active",
    label: "Engineering Judgment",
    items: [
      ["prototype", "Write the smallest throwaway program that answers one design question."],
      ["resolving-merge-conflicts", "Resolve conflicts from each side’s original intent, never by blindly picking lines."],
      ["improve-codebase-architecture", "Find architectural friction and high-leverage deepening opportunities."],
      ["codebase-design", "Design deep modules: substantial behavior behind small interfaces at clean seams."],
      ["domain-modeling", "Sharpen overloaded terms, edge cases, glossaries, and hard-to-reverse decisions."],
      ["ponytail", "Use senior-simplicity mode to cut speculative abstractions and write the least code that solves today’s problem."],
    ],
  },
  {
    status: "active",
    label: "UI and Design",
    items: [
      ["hallmark", "Apply opinionated UI rules that make generated interfaces feel deliberately designed, not generic."],
      ["ui-ux-pro-max", "Search styles, palettes, font pairings, UX rules, icons, and motion guidance."],
      ["design", "Use one umbrella skill for brand, tokens, UI, logos, slides, banners, social assets, and icons."],
    ],
  },
  {
    status: "active",
    label: "Cloud and Web",
    items: [
      ["cloudflare", "Choose the right Cloudflare product and retrieve current platform guidance before building."],
      ["wrangler", "Use current Wrangler CLI, configuration, deployment, and troubleshooting guidance."],
      ["workers-best-practices", "Apply retrieval-first rules for writing and reviewing modern Cloudflare Workers."],
      ["web-perf", "Audit Core Web Vitals, bundles, loading, and runtime behavior using current thresholds."],
    ],
  },
  {
    status: "active",
    label: "Writing and Context",
    items: [
      ["writing-for-agents", "Write reliable skills, AGENTS.md files, and agent-facing reference documents."],
      ["writing-fragments", "Explore raw ideas broadly without committing to structure too early."],
      ["writing-shape", "Turn a pile of material into a coherent argument or story structure."],
      ["writing-beats", "Mine fixed source material to fill a detailed beat-by-beat sequence."],
      ["handoff", "Save a portable, redacted context summary so another session can continue cleanly."],
      ["wait-what", "Force a plain-English re-pitch using the project’s agreed vocabulary."],
    ],
  },
  {
    status: "active",
    label: "High-Leverage Specialists",
    items: [
      ["wayfinder", "Map decisions for a huge, foggy effort, then hand the cleared path to a specification instead of building prematurely."],
      ["teach", "Run a stateful, multi-session learning workspace with lessons, references, and learning records."],
    ],
  },
  {
    status: "archived",
    label: "Apps and Integrations",
    items: [
      ["telegram-bot-builder", "No active Telegram project; current bot work is centered on Discord and content tooling."],
      ["affine-native", "Narrow app integration with no current AFFiNE work in the active projects."],
      ["OnlyOffice", "Product reference rather than an actionable agent workflow; Word plus Google Docs already cover this need."],
    ],
  },
  {
    status: "archived",
    label: "Cloud and Web",
    items: [
      ["durable-objects", "Useful only when a project needs edge state or coordination; the active cloudflare skill can route here."],
      ["turnstile-spin", "Single-feature setup skill; only needed when a project is actively adding bot protection."],
      ["cloudflare-email-service", "No active email-service build; the main cloudflare skill is enough until one exists."],
      ["sandbox-sdk", "Experimental, infrastructure-heavy niche with no current sandbox workload."],
    ],
  },
  {
    status: "archived",
    label: "Engineering",
    items: [
      ["karpathy-guidelines", "Overlaps global agent rules, TDD, diagnosis, and code review rather than needing a separate invocation."],
      ["remotion-best-practices", "Remotion projects are archived, so this is not part of the daily stack."],
      ["obscura", "Built-in browser and Chrome tools cover normal automation; only valuable for specialized stealth work."],
      ["migrate-to-shoehorn", "Package-specific, test-only migration for repositories already adopting shoehorn."],
    ],
  },
  {
    status: "archived",
    label: "Personas and Meta Tools",
    items: [
      ["grilling", "The active grill-with-docs wrapper already invokes this behavior with repository context."],
      ["ponytail-review", "Active code-review plus ponytail covers the same outcome with broader quality checks."],
      ["ponytail-audit", "Occasional maintenance tool; improve-codebase-architecture covers broader repository health."],
      ["ask-matt", "This ranked reference replaces that routing guide and makes the main flow directly visible."],
      ["grill-me", "Most work happens inside repositories, where grill-with-docs leaves a useful paper trail."],
      ["cavecrew", "Claude-specific delegation format that does not match the current Codex workflow."],
      ["loop-me", "Very narrow workflow-design use case; not a general planning tool."],
      ["ponytail-debt", "Useful only after a project consistently adopts the ponytail comment convention."],
      ["ponytail-help", "Help card only; the active ponytail skill contains the working behavior."],
      ["ponytail-gain", "Informational scoreboard, not a tool that advances project work."],
      ["caveman-review", "Active code-review plus the global concise communication rule already provides this."],
      ["caveman-commit", "GitHub Publisher and the concise style already cover commit-message quality."],
      ["caveman-compress", "Destructive, niche optimization with readability costs; instructions are already concise."],
      ["caveman", "Redundant because global AGENTS.md already requires extreme concision."],
      ["caveman-help", "Meta-only help card for an archived persona."],
      ["caveman-stats", "Hook-specific display utility that performs no reasoning or project work."],
    ],
  },
  {
    status: "archived",
    label: "Planning and Process",
    items: [
      ["triage", "Current work is not dominated by an inbound issue queue; the active spec-to-ticket flow covers self-created work."],
      ["to-questionnaire", "High value only when progress depends on another person’s knowledge, which is not a daily condition."],
      ["wizard", "Reserved for rare moments when automation is blocked by a genuinely manual external step."],
      ["plandeck", "Adds a separate planning system and overhead when built-in plans and tickets are sufficient."],
      ["claude-handoff", "Claude-specific and duplicates the active portable handoff skill."],
    ],
  },
  {
    status: "archived",
    label: "Tooling and Setup",
    items: [
      ["setup-pre-commit", "Useful one-time repository setup, not a daily skill; reactivate when a JavaScript project lacks hooks."],
      ["find-skills", "Discovery stays archived until a concrete capability gap appears."],
      ["setup-matt-pocock-skills", "One-time precondition; the workflow is already represented in the active stack."],
      ["setup-ts-deep-modules", "Specialized architecture enforcement; codebase-design covers the general principle."],
      ["git-guardrails-claude-code", "Claude-specific, while Codex already follows explicit Git safety rules."],
      ["scaffold-exercises", "Project-specific convention with no active exercise-authoring repository."],
    ],
  },
  {
    status: "archived",
    label: "UI and Design",
    items: [
      ["design-system", "Valuable for a dedicated system build, but the active design skill covers normal token and component work."],
      ["shadcn", "No active repository currently has shadcn configuration; reactivate when components.json appears."],
      ["brand", "Overlaps the active design umbrella; reactivate for a dedicated brand-identity engagement."],
      ["banner-design", "Covered by the active design workflow and image generation unless a campaign needs a dedicated banner system."],
      ["ui-styling", "Substantial overlap with hallmark, ui-ux-pro-max, and design."],
      ["slides", "A newer dedicated presentations workflow makes this short reference redundant."],
      ["material-ui-nextjs", "No active Material UI project."],
      ["material-ui-theming", "No active Material UI project."],
      ["material-ui-styling", "No active Material UI project."],
      ["material-ui-tailwind", "No active project combining Material UI and Tailwind."],
      ["chakra-ui-builder", "No active Chakra UI project."],
      ["chakra-ui-refactor", "No active Chakra UI project."],
      ["chakra-ui-migrate", "Migration-only tool with no active Chakra v2 codebase."],
      ["migrate-radix-to-base", "No active Radix-to-Base migration."],
    ],
  },
  {
    status: "archived",
    label: "Unsorted",
    items: [
      ["ratchet review", "Claude-oriented and overlaps code-review while adding heavy review cost to routine work."],
      ["Unnamed empty entry", "Empty record with no name, instructions, or executable guidance."],
    ],
  },
];

const entries = SKILL_STACK_GROUPS.flatMap((group) => group.items.map(([name, summary], rank) => ({ ...group, items: undefined, name, summary, rank })));
const referenceByName = new Map(entries.map((entry, rank) => [entry.name.toLocaleLowerCase(), { ...entry, globalRank: rank }]));

export function displaySkillName(skill) {
  return skill?.name?.trim() || "Unnamed empty entry";
}

export function skillStackReference(skill) {
  return referenceByName.get(displaySkillName(skill).toLocaleLowerCase()) || null;
}

export function isArchivedSkill(skill) {
  return skillStackReference(skill)?.status === "archived" || (skill?.category || "").startsWith("99 · Archive");
}

export function sortSkillsByStack(left, right) {
  const leftReference = skillStackReference(left);
  const rightReference = skillStackReference(right);
  if (leftReference && rightReference) return leftReference.globalRank - rightReference.globalRank;
  if (leftReference) return -1;
  if (rightReference) return 1;
  return (left.category || "Unsorted").localeCompare(right.category || "Unsorted") || displaySkillName(left).localeCompare(displaySkillName(right));
}

export function cleanSkillCategory(category) {
  return (category || "Unsorted")
    .replace(/^\d+\s*·\s*/, "")
    .replace(/^Archive\s*[—-]\s*/, "");
}

export function isArchiveLabel(label) {
  return /^archive/i.test(label);
}

// Shelf titles drop the "Archive · " prefix; the browser shows one Archive divider instead.
export function shelfLabel(label) {
  return label.replace(/^archive\s*[·—-]\s*/i, "") || "Archive";
}

function bestFirst(left, right) {
  return Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || sortSkillsByStack(left, right);
}

// Splits a library into category shelves: starred and highest-ranked skills first, archive shelves last.
export function groupSkills(skills, scope = "active", query = "") {
  const needle = query.trim().toLowerCase();
  const visible = skills.filter((skill) => {
    if (scope === "active" && isArchivedSkill(skill)) return false;
    if (scope === "starred" && !skill.pinned) return false;
    if (!needle) return true;
    return `${displaySkillName(skill)} ${cleanSkillCategory(skill.category)} ${skill.body || ""}`.toLowerCase().includes(needle);
  });
  const ordered = [...visible].sort(sortSkillsByStack);
  const groups = [...new Set(ordered.map((skill) => cleanSkillCategory(skill.category)))].map((label) => {
    const items = ordered.filter((skill) => cleanSkillCategory(skill.category) === label).sort(bestFirst);
    return { label, items, archived: isArchiveLabel(label) || items.every(isArchivedSkill) };
  });
  return [...groups.filter((group) => !group.archived), ...groups.filter((group) => group.archived)];
}
