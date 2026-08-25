const assert = require("node:assert/strict");
const path = require("path");
const { createHandyVoiceController, resolveHandyExecutable } = require("../src/main/handy-voice.cjs");

assert.equal(
  resolveHandyExecutable({ localAppData: "C:\\Users\\Kai\\AppData\\Local" }),
  path.win32.join("C:\\Users\\Kai\\AppData\\Local", "Handy", "handy.exe"),
  "Handy resolves from the current Windows account instead of a hard-coded user path",
);

{
  const calls = [];
  const phases = [];
  const scheduled = [];
  const controller = createHandyVoiceController({
    executablePath: "C:\\Apps\\Handy\\handy.exe",
    existsSync: () => true,
    spawnProcess: (file, args, options) => { calls.push({ file, args, options }); return { unref() {} }; },
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    clearScheduled: () => {},
    showTarget: () => phases.push("shown"),
    notify: (update) => phases.push(update.phase),
  });

  assert.equal(controller.trigger(), "recording");
  assert.deepEqual(phases, ["shown", "recording"]);
  assert.equal(calls.length, 0, "Handy waits for the Notebook input to receive focus");
  scheduled.shift()();
  assert.deepEqual(calls[0].args, ["--toggle-transcription"]);
  assert.equal(calls[0].options.shell, false, "voice integration never sends transcript text through a shell");

  assert.equal(controller.trigger(), "transcribing");
  assert.deepEqual(calls[1].args, ["--toggle-transcription"]);
  assert.equal(controller.complete(), "idle");
  assert.equal(controller.getPhase(), "idle");
}

{
  const updates = [];
  const controller = createHandyVoiceController({
    executablePath: "C:\\Missing\\handy.exe",
    existsSync: () => false,
    notify: (update) => updates.push(update),
  });
  assert.equal(controller.trigger(), "idle");
  assert.match(updates[0].message, /Handy is not installed/);
}

console.log("Handy quick voice controller tests passed.");
