const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function resolveHandyExecutable({ localAppData = process.env.LOCALAPPDATA || "" } = {}) {
  if (!localAppData) return "";
  return path.win32.join(localAppData, "Handy", "handy.exe");
}

function createHandyVoiceController({
  executablePath = resolveHandyExecutable(),
  existsSync = fs.existsSync,
  spawnProcess = spawn,
  schedule = setTimeout,
  clearScheduled = clearTimeout,
  focusDelayMs = 240,
  showTarget = () => {},
  notify = () => {},
  logger = console,
} = {}) {
  let phase = "idle";
  let startTimer = null;
  let recordingStarted = false;
  let sessionId = "";

  function setPhase(next, extra = {}) {
    phase = next;
    notify({ id: sessionId, phase: next, ...extra });
    return phase;
  }

  function invoke(flag) {
    try {
      const child = spawnProcess(executablePath, [flag], { detached: true, shell: false, stdio: "ignore", windowsHide: true });
      child.once?.("error", (error) => {
        logger.error(`Could not control Handy: ${error.message}`);
        setPhase("error", { message: "Handy could not start. Open Handy once, then retry." });
      });
      child.unref?.();
      return true;
    } catch (error) {
      logger.error(`Could not control Handy: ${error.message}`);
      setPhase("error", { message: "Handy could not start. Open Handy once, then retry." });
      return false;
    }
  }

  function startRecording() {
    startTimer = null;
    recordingStarted = invoke("--toggle-transcription");
  }

  function trigger() {
    if (phase === "transcribing") return phase;
    if (phase === "idle" || phase === "error") {
      if (!executablePath || path.win32.basename(executablePath).toLowerCase() !== "handy.exe" || !existsSync(executablePath)) {
        setPhase("error", { message: "Handy is not installed for this Windows account." });
        phase = "idle";
        return phase;
      }
      showTarget();
      sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      recordingStarted = false;
      setPhase("recording");
      startTimer = schedule(startRecording, focusDelayMs);
      return phase;
    }

    if (startTimer !== null) {
      clearScheduled(startTimer);
      startTimer = null;
      recordingStarted = invoke("--toggle-transcription");
    }
    if (recordingStarted && invoke("--toggle-transcription")) setPhase("transcribing");
    return phase;
  }

  function complete() {
    if (startTimer !== null) clearScheduled(startTimer);
    startTimer = null;
    recordingStarted = false;
    sessionId = "";
    phase = "idle";
    return phase;
  }

  function cancel() {
    if (startTimer !== null) clearScheduled(startTimer);
    startTimer = null;
    if (recordingStarted) invoke("--cancel");
    recordingStarted = false;
    sessionId = "";
    phase = "idle";
    return phase;
  }

  return { trigger, complete, cancel, getPhase: () => phase };
}

module.exports = { createHandyVoiceController, resolveHandyExecutable };
