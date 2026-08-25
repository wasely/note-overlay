const { createHash } = require("node:crypto");

const STATUS_RANK = { open: 0, carried: 1, done: 2 };

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function timestamp(task) { return String(task?.updated_at || task?.completed_at || task?.created_at || ""); }
function completionTime(task) { return String(task?.completed_at || task?.updated_at || task?.created_at || "9999"); }

function preferredTask(left, right) {
  const leftRank = STATUS_RANK[left.status] ?? 0;
  const rightRank = STATUS_RANK[right.status] ?? 0;
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  if (left.status === "done" && completionTime(left) !== completionTime(right)) return completionTime(left) < completionTime(right) ? left : right;
  if (timestamp(left) !== timestamp(right)) return timestamp(left) > timestamp(right) ? left : right;
  return String(left.id).localeCompare(String(right.id)) <= 0 ? left : right;
}

function rootId(task, byId, memo) {
  if (memo.has(task.id)) return memo.get(task.id);
  const path = [];
  const seen = new Map();
  let current = task;
  while (current) {
    if (memo.has(current.id)) {
      const root = memo.get(current.id);
      for (const id of path) memo.set(id, root);
      return root;
    }
    if (seen.has(current.id)) {
      const cycle = path.slice(seen.get(current.id));
      const root = [...cycle].sort()[0];
      for (const id of path) memo.set(id, root);
      return root;
    }
    seen.set(current.id, path.length);
    path.push(current.id);
    if (current.carried_from_id && !byId.has(current.carried_from_id)) {
      const root = current.carried_from_id;
      for (const id of path) memo.set(id, root);
      return root;
    }
    current = current.carried_from_id ? byId.get(current.carried_from_id) : null;
  }
  const root = path[path.length - 1];
  for (const id of path) memo.set(id, root);
  return root;
}

function normalizeDailyTasks(input) {
  const byId = new Map();
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.task_date || "") || !String(raw.text || "").trim()) continue;
    const task = { ...clone(raw), text: String(raw.text).trim(), status: STATUS_RANK[raw.status] === undefined ? "open" : raw.status, carried_from_id: raw.carried_from_id || null };
    if (task.status !== "done") { task.completed_at = null; task.completed_on = null; }
    else { task.completed_at ||= task.updated_at || task.created_at || null; task.completed_on ||= task.task_date; }
    byId.set(task.id, byId.has(task.id) ? preferredTask(byId.get(task.id), task) : task);
  }

  const roots = new Map();
  const groups = new Map();
  for (const task of byId.values()) {
    const root = rootId(task, byId, roots);
    const key = `${root}\0${task.task_date}`;
    if (!groups.has(key)) groups.set(key, { root, tasks: [] });
    groups.get(key).tasks.push(task);
  }

  const replacements = new Map();
  const winners = [];
  for (const group of groups.values()) {
    const winner = group.tasks.reduce(preferredTask);
    for (const task of group.tasks) replacements.set(task.id, winner.id);
    winners.push({ root: group.root, task: clone(winner) });
  }

  const completedOn = new Map();
  for (const { root, task } of winners) {
    if (task.status !== "done") continue;
    const prior = completedOn.get(root);
    if (!prior || task.task_date < prior) completedOn.set(root, task.task_date);
  }
  const kept = winners.filter(({ root, task }) => !completedOn.has(root) || task.task_date <= completedOn.get(root));
  const keptIds = new Set(kept.map(({ task }) => task.id));

  for (const { task } of kept) {
    let parent = task.carried_from_id;
    const seen = new Set();
    while (parent && replacements.has(parent) && replacements.get(parent) !== parent && !seen.has(parent)) {
      seen.add(parent);
      parent = replacements.get(parent);
    }
    task.carried_from_id = parent && keptIds.has(parent) ? parent : null;
  }

  const keptById = new Map(kept.map(({ task }) => [task.id, task]));
  for (const { task } of kept) {
    const parent = task.carried_from_id && keptById.get(task.carried_from_id);
    if (parent?.status === "open") {
      parent.status = "carried";
      parent.completed_at = null;
      parent.completed_on = null;
      if (String(task.created_at || "") > timestamp(parent)) parent.updated_at = task.created_at;
    }
  }

  return kept.map(({ task }) => task).sort((left, right) => (
    right.task_date.localeCompare(left.task_date)
    || (Number(left.priority) || 2) - (Number(right.priority) || 2)
    || String(left.created_at || "").localeCompare(String(right.created_at || ""))
    || left.id.localeCompare(right.id)
  ));
}

function reconcileConcurrentCompletions(merged, base, local, remote) {
  const before = new Map((base || []).map((task) => [task.id, task]));
  const here = new Map((local || []).map((task) => [task.id, task]));
  const there = new Map((remote || []).map((task) => [task.id, task]));
  return (merged || []).map((task) => {
    const left = here.get(task.id);
    const right = there.get(task.id);
    const prior = before.get(task.id);
    if (!left || !right || prior?.status === "done" || left.status === right.status) return task;
    const completed = left.status === "done" ? left : right.status === "done" ? right : null;
    if (!completed) return task;
    return {
      ...task,
      status: "done",
      completed_at: completed.completed_at || completed.updated_at || completed.created_at || null,
      completed_on: completed.completed_on || completed.task_date,
      updated_at: [timestamp(task), timestamp(left), timestamp(right)].sort().at(-1),
    };
  });
}

function dailyCarryId(sourceId, date) {
  const digest = createHash("sha256").update(`${sourceId}\0${date}`).digest("hex").slice(0, 32);
  return `daily-carry-${digest}`;
}

module.exports = { dailyCarryId, normalizeDailyTasks, reconcileConcurrentCompletions };
