import assert from "node:assert/strict";
import { SKILL_STACK_GROUPS, cleanSkillCategory, displaySkillName, groupSkills, isArchivedSkill, shelfLabel, skillStackReference, sortSkillsByStack } from "../src/renderer/skill-stack.js";

assert.equal(SKILL_STACK_GROUPS[0].label, "My skills");
assert.equal(SKILL_STACK_GROUPS[0].items.length, 14);
assert.equal(SKILL_STACK_GROUPS[0].items[0][0], "1");
assert.equal(SKILL_STACK_GROUPS[0].items.at(-1)[0], "ui-intergrity");
assert.equal(SKILL_STACK_GROUPS.filter((group) => group.status === "active").flatMap((group) => group.items).length, 44);
assert.equal(displaySkillName({ name: "" }), "Unnamed empty entry");
assert.equal(skillStackReference({ name: "frontend-design" }).label, "UI");
assert.equal(isArchivedSkill({ name: "Grilling", category: "01 · Planning" }), false);
assert.equal(isArchivedSkill({ name: "new-skill", category: "99 · Archive — Custom" }), true);
assert.equal(cleanSkillCategory("99 · Archive — Apps & Integrations"), "Apps & Integrations");

const sorted = [{ name: "skill-creator" }, { name: "Prototype" }, { name: "Grill-with-docs" }].sort(sortSkillsByStack).map((skill) => skill.name);
assert.deepEqual(sorted, ["Grill-with-docs", "Prototype", "skill-creator"]);

const library = [
  { id: "mine", name: "quick-context", category: "00 · My skills", body: "Load context.", ownership: "mine", source_url: "https://github.com/blixvip/skills" },
  { id: "a", name: "To-spec", category: "01 · Planning", body: "Write a specification.", ownership: "other" },
  { id: "b", name: "Prototype", category: "01 · Planning", body: "Build it.", pinned: true, ownership: "other" },
  { id: "c", name: "frontend-design", category: "03 · UI", body: "Design rules.", ownership: "other" },
  { id: "d", name: "caveman", category: "99 · Archive · Personas & Meta", body: "Retired persona.", ownership: "other" },
];
const active = groupSkills(library, "active");
assert.deepEqual(active.map((group) => group.label), ["My skills", "Planning", "UI"], "owned skills lead and archived skills stay out of Active");
assert.deepEqual(active[1].items.map((skill) => skill.name), ["Prototype", "To-spec"], "starred skills lead their shelf");
const all = groupSkills(library, "all");
assert.equal(all.at(-1).archived, true, "archive shelves sort last");
assert.equal(shelfLabel(all.at(-1).label), "Personas & Meta");
assert.deepEqual(groupSkills(library, "starred").flatMap((group) => group.items).map((skill) => skill.id), ["b"]);
assert.deepEqual(groupSkills(library, "all", "design").flatMap((group) => group.items).map((skill) => skill.id), ["c"], "filter matches name, category, and body");
assert.deepEqual(groupSkills(library, "all", "blixvip").flatMap((group) => group.items).map((skill) => skill.id), ["mine"], "filter matches source links");

console.log("Skill Stack ranking, archive, category, and shelf grouping tests passed.");
