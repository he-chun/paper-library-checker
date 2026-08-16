import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manualResults = path.join(root, "tools", "manual-verification", "results");
async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist"].includes(item.name)) continue;
    const full = path.join(directory, item.name);
    if (full === manualResults) continue;
    if (item.isDirectory()) result.push(...await walk(full)); else result.push(full);
  }
  return result;
}
const files = await walk(root);
for (const file of files.filter((name) => name.endsWith(".js") || name.endsWith(".mjs"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
for (const file of files.filter((name) => name.endsWith(".json"))) JSON.parse(await readFile(file, "utf8"));
const text = (await Promise.all(files.filter((name) => !/\.(?:png|zip|xpi)$/i.test(name)).map((name) => readFile(name, "utf8")))).join("\n");
const forbidden = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /[A-Z]:[\\/](?:Users|claude)[\\/]/i
];
for (const pattern of forbidden) if (pattern.test(text)) throw new Error(`Sensitive pattern found: ${pattern}`);
execFileSync(process.execPath, [path.join(root, "scripts", "dependency-inventory.mjs")], { stdio: "inherit" });
console.log(`Checked ${files.length} files`);
