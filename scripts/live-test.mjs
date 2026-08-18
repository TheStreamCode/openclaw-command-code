// Live inference test against the Command Code Provider API.
// Reads the key from ~/.openclaw/secrets/providers.json (never printed).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const secretsPath = path.join(home, ".openclaw", "secrets", "providers.json");
const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
const key = secrets["commandcode:default"];
if (!key) {
  console.error("commandcode:default not found in secrets");
  process.exit(1);
}
console.log("key:", key.slice(0, 5) + "… len=" + key.length);

const base = "https://api.commandcode.ai/provider/v1";
const model = "deepseek/deepseek-v4-flash"; // cheap model
const url = `${base}/chat/completions`;

const body = {
  model,
  messages: [{ role: "user", content: "Reply with the single word: ok" }],
  max_tokens: 8,
  stream: false,
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("HTTP", res.status);
console.log("body head:", text.slice(0, 400));
