// The curated order used by the Skills library. Categories in storage keep their
// numeric prefixes for ordering; the UI removes those prefixes when it renders.
export const SKILL_STACK_GROUPS = [
  {
    status: "active",
    label: "My skills",
    items: [
      ["1", "Fast execution timebox for small, well-defined tasks."],
      ["2", "Short execution timebox for straightforward tasks."],
      ["3", "Standard execution timebox for moderately involved tasks."],
      ["4", "Deeper execution timebox for substantial tasks."],
      ["5", "Maximum normal execution timebox for complex tasks."],
      ["asap", "Take the shortest reliable path while preserving correctness."],
      ["backbefore", "Restore the last good version, then reapply the newest request."],
      ["components", "Scout and implement strong UI components from approved libraries."],
      ["github", "Audit, document, validate, commit, and safely publish projects."],
      ["huh", "Report current activity immediately and tersely."],
      ["instant", "Answer immediately with the best available response."],
      ["quick-context", "Load a selected project's CLAUDE.md instructions quickly."],
      ["shader-ui", "Add tasteful, localized shader effects to interfaces."],
      ["ui-intergrity", "Prevent overlap, clipping, stacking, and integration bugs."],
    ],
  },
  {
    status: "active",
    label: "Planning",
    items: [
      ["Grill-with-docs", "Pressure-test an idea against repository documentation before planning."],
      ["To-spec", "Turn established conversation and code context into a concrete build specification."],
      ["Grilling", "Interrogate requirements, assumptions, constraints, and tradeoffs before committing."],
      ["Prototype", "Build the smallest throwaway implementation that answers one design question."],
    ],
  },
  {
    status: "active",
    label: "Code Format",
    items: [
      ["Improve Codebase Architecture", "Find high-leverage structural improvements without unnecessary churn."],
      ["Code Simplification", "Remove avoidable complexity while preserving behavior."],
      ["Code Review & Quality", "Review implementation quality, correctness, and maintainability."],
    ],
  },
  {
    status: "active",
    label: "UI",
    items: [
      ["frontend-design", "Create distinctive, production-quality interfaces instead of generic AI UI."],
      ["frontend-ui-engineering", "Apply practical frontend engineering patterns to interface work."],
      ["web-design-guidelines", "Review interfaces against modern web design and accessibility guidance."],
    ],
  },
  {
    status: "active",
    label: "Safety",
    items: [
      ["SecOpsAgentKit", "Security operations workflows for agent-driven projects."],
      ["AI Security Arsenal", "A focused collection of AI security tools and practices."],
      ["Superagent Security Skills", "Reusable security skills from Superagent."],
      ["Security & Hardening", "Addy Osmani's security and hardening guidance."],
      ["SkillTotal", "Track and inspect agent skill security changes."],
    ],
  },
  {
    status: "active",
    label: "Anti-Slop — Frontend / UI",
    items: [
      ["Impeccable", "Refine hierarchy, type, spacing, responsiveness, UX, accessibility, motion, and UI copy."],
      ["Frontend Design Principles", "Use clear principles to prevent generic frontend output."],
      ["Frontend Design 2.0", "PracticalSwan's updated frontend design workflow."],
    ],
  },
  {
    status: "active",
    label: "Anti-Slop — Backend / Code",
    items: [
      ["Test-Driven Development", "Build behavior through a red, green, refactor loop."],
      ["Debugging & Error Recovery", "Diagnose failures systematically and recover safely."],
    ],
  },
  {
    status: "active",
    label: "Anti-Slop — Text / Writing",
    items: [
      ["Anti-Slop Writing", "Remove generic AI phrasing and empty prose."],
      ["Writing Clearly & Concisely", "Write direct, precise prose without filler."],
      ["Red Pen", "Edit aggressively for clarity, precision, and economy."],
      ["Vercel Writing Guidelines", "Apply Vercel's product-writing guidance."],
    ],
  },
  {
    status: "active",
    label: "Caveats Testing",
    items: [
      ["Agentic QE Fleet", "Generate tests and find gaps across coverage, mutation, chaos, security, and performance."],
      ["Schemathesis", "Break APIs with schema-driven boundary, invalid, random, and stateful requests."],
      ["Continuous Claude", "Run a persistent testing and CI repair loop across large projects."],
    ],
  },
  {
    status: "active",
    label: "Skill Creation",
    items: [
      ["skill-creator", "Anthropic's official skill-creation meta-skill."],
      ["agent-skill-creator", "Turn workflows into packaged, cross-platform Agent Skills."],
      ["write-a-skill", "Create clean, focused skills with progressive disclosure."],
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

export function skillOwnership(skill) {
  return skill?.ownership === "other" ? "other" : "mine";
}

export function sortSkillsByStack(left, right) {
  const ownershipOrder = Number(skillOwnership(left) === "other") - Number(skillOwnership(right) === "other");
  if (ownershipOrder) return ownershipOrder;
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
  return /^archive\b/i.test(label);
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
    return `${displaySkillName(skill)} ${cleanSkillCategory(skill.category)} ${skill.source_url || ""} ${skill.body || ""}`.toLowerCase().includes(needle);
  });
  const ordered = [...visible].sort(sortSkillsByStack);
  const groupKeys = [...new Set(ordered.map((skill) => `${skillOwnership(skill)}:${cleanSkillCategory(skill.category)}`))];
  const groups = groupKeys.map((key) => {
    const [ownership, ...labelParts] = key.split(":");
    const label = labelParts.join(":");
    const items = ordered.filter((skill) => skillOwnership(skill) === ownership && cleanSkillCategory(skill.category) === label).sort(bestFirst);
    return { key, label, ownership, items, archived: isArchiveLabel(label) || items.every(isArchivedSkill) };
  });
  return groups.sort((left, right) => Number(left.ownership === "other") - Number(right.ownership === "other") || Number(left.archived) - Number(right.archived));
}
