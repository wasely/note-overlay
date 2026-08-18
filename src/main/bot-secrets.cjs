const fs = require("fs");
const path = require("path");

const REFERENCE = /^[A-Z_][A-Z0-9_]{1,127}$/;

function createBotSecretStore({ userDataPath, safeStorage }) {
  const file = path.join(userDataPath, "bot-secrets.v1.json");
  let values = null;

  function load() {
    if (values) return values;
    if (!fs.existsSync(file)) { values = {}; return values; }
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("Encrypted bot secrets could not be read."); }
    if (parsed?.schemaVersion !== 1 || !parsed.values || typeof parsed.values !== "object" || Array.isArray(parsed.values)) throw new Error("Encrypted bot secret store has an unsupported format.");
    values = parsed.values;
    return values;
  }

  function persist() {
    fs.mkdirSync(userDataPath, { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, values: load() }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  function validate(reference) {
    if (!REFERENCE.test(String(reference || ""))) throw new Error("Secret reference is invalid.");
  }

  function set(reference, value) {
    validate(reference);
    if (typeof value !== "string" || value.length < 1 || value.length > 10_000) throw new Error("Secret value is invalid.");
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error("Windows credential encryption is unavailable.");
    load()[reference] = safeStorage.encryptString(value).toString("base64");
    persist();
  }

  function get(reference) {
    validate(reference);
    const encoded = load()[reference];
    if (typeof encoded !== "string") return undefined;
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error("Windows credential encryption is unavailable.");
    try { return safeStorage.decryptString(Buffer.from(encoded, "base64")); } catch { throw new Error("Encrypted bot secret could not be unlocked."); }
  }

  function has(reference) {
    validate(reference);
    return typeof load()[reference] === "string";
  }

  function remove(reference) {
    validate(reference);
    if (!Object.prototype.hasOwnProperty.call(load(), reference)) return false;
    delete values[reference];
    persist();
    return true;
  }

  return { set, get, has, remove };
}

module.exports = { createBotSecretStore };
