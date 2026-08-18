import assert from "node:assert/strict";
import { SKILL_STACK_GROUPS, cleanSkillCategory, displaySkillName, groupSkills, isArchivedSkill, shelfLabel, skillStackReference, sortSkillsByStack } from "../src/renderer/skill-stack.js";

assert.equal(SKILL_STACK_GROUPS[0].label, "Core Workflow");
assert.equal(SKILL_STACK_GROUPS[0].items[0][0], "GitHub Publisher ($github)");
assert.equal(SKILL_STACK_GROUPS.filter((group) => group.status === "active").flatMap((group) => group.items).length, 30);
assert.equal(displaySkillName({ name: "" }), "Unnamed empty entry");
assert.equal(skillStackReference({ name: "hallmark" }).label, "UI and Design");
assert.equal(isArchivedSkill({ name: "telegram-bot-builder", category: "Anything" }), true);
assert.equal(isArchivedSkill({ name: "new-skill", category: "99 · Archive — Custom" }), true);
assert.equal(cleanSkillCategory("99 · Archive — Apps & Integrations"), "Apps & Integrations");

const sorted = [{ name: "research" }, { name: "prototype" }, { name: "GitHub Publisher ($github)" }].sort(sortSkillsByStack).map((skill) => skill.name);
assert.deepEqual(sorted, ["GitHub Publisher ($github)", "research", "prototype"]);

const library = [
  { id: "a", name: "to-spec", category: "01 · Core Workflow", body: "Write a specification." },
  { id: "b", name: "implement", category: "01 · Core Workflow", body: "Build it.", pinned: true },
  { id: "c", name: "hallmark", category: "03 · UI & Design", body: "Design rules." },
  { id: "d", name: "caveman", category: "99 · Archive · Personas & Meta", body: "Retired persona." },
];
const active = groupSkills(library, "active");
assert.deepEqual(active.map((group) => group.label), ["Core Workflow", "UI & Design"], "archived skills stay out of Active");
assert.deepEqual(active[0].items.map((skill) => skill.name), ["implement", "to-spec"], "starred skills lead their shelf");
const all = groupSkills(library, "all");
assert.equal(all.at(-1).archived, true, "archive shelves sort last");
assert.equal(shelfLabel(all.at(-1).label), "Personas & Meta");
assert.deepEqual(groupSkills(library, "starred").flatMap((group) => group.items).map((skill) => skill.id), ["b"]);
assert.deepEqual(groupSkills(library, "all", "design").flatMap((group) => group.items).map((skill) => skill.id), ["c"], "filter matches name, category, and body");

console.log("Skill Stack ranking, archive, category, and shelf grouping tests passed.");
