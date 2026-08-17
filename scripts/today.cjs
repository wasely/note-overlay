const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");

function usage() {
  return [
    "Notebook Today CLI",
    "",
    "npm run today -- list",
    "npm run today -- add --text \"Ship onboarding\" --priority 1 --owner me",
    "npm run today -- update <id> --priority 2 --owner agent --bucket tomorrow",
    "npm run today -- done <id>",
    "npm run today -- reopen <id>",
    "",
    "Options: --text, --priority 1|2|3, --owner me|agent, --bucket today|tomorrow",
  ].join("\n");
}

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function taskPatch(args, requireText = false) {
  const text = option(args, "text");
  const priorityValue = option(args, "priority");
  const owner = option(args, "owner");
  const bucket = option(args, "bucket");
  if (requireText && !text?.trim()) throw new Error("--text is required.");
  if (priorityValue !== undefined && !["1", "2", "3"].includes(priorityValue)) throw new Error("--priority must be 1, 2, or 3.");
  if (owner !== undefined && !["me", "agent"].includes(owner)) throw new Error("--owner must be me or agent.");
  if (bucket !== undefined && !["today", "tomorrow"].includes(bucket)) throw new Error("--bucket must be today or tomorrow.");
  return {
    ...(text !== undefined ? { text: text.trim() } : {}),
    ...(priorityValue !== undefined ? { priority: Number(priorityValue) } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(bucket !== undefined ? { bucket } : {}),
  };
}

function resolveTaskId(daily, value) {
  if (!value) throw new Error("Task id is required.");
  const tasks = [...daily.today, ...daily.tomorrow, ...daily.done];
  const matches = tasks.filter((task) => task.id === value || task.id.startsWith(value));
  if (matches.length !== 1) throw new Error(matches.length ? "Task id prefix is ambiguous." : "Task not found in today, tomorrow, or done today.");
  return matches[0].id;
}

const args = process.argv.slice(2);
const command = args.shift() || "list";
if (["help", "--help", "-h"].includes(command)) {
  console.log(usage());
  process.exit(0);
}

const appData = process.env.NOTEBOOK_DATA_DIR || (process.env.APPDATA && path.join(process.env.APPDATA, "note-overlay"));
if (!appData) throw new Error("APPDATA is unavailable. Set NOTEBOOK_DATA_DIR explicitly.");
const store = createStorage(appData);

try {
  let daily = store.dailyDashboard();
  if (command === "add") {
    const patch = taskPatch(args, true);
    daily = store.createDailyTask({ ...patch, bucket: patch.bucket || "today" });
  } else if (command === "update") {
    const id = resolveTaskId(daily, args[0]);
    const patch = taskPatch(args.slice(1));
    if (!Object.keys(patch).length) throw new Error("Provide at least one field to update.");
    daily = store.updateDailyTask(id, patch);
  } else if (command === "done" || command === "reopen") {
    const id = resolveTaskId(daily, args[0]);
    daily = store.completeDailyTask(id, command === "done");
  } else if (command !== "list") {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
  console.log(JSON.stringify(daily, null, 2));
} finally {
  store.close();
}
