import assert from "node:assert/strict";
import { SKILL_STACK_GROUPS, cleanSkillCategory, displaySkillName, isArchivedSkill, skillStackReference, sortSkillsByStack } from "../src/renderer/skill-stack.js";

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

console.log("Skill Stack ranking, archive, and category tests passed.");
