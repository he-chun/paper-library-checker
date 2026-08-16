import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const checker = path.join(root, ".github", "scripts", "check-whitespace.mjs");
const workflow = path.join(root, ".github", "workflows", "ci.yml");

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

function repository() {
  const directory = mkdtempSync(path.join(tmpdir(), "plc-whitespace-"));
  git(directory, "init", "-b", "main");
  git(directory, "config", "user.name", "Synthetic Test");
  git(directory, "config", "user.email", "synthetic@example.invalid");
  return directory;
}

function commit(repository, name, content) {
  writeFileSync(path.join(repository, name), content);
  git(repository, "add", name);
  git(repository, "commit", "-m", name);
  return git(repository, "rev-parse", "HEAD");
}

function check(repository, event, baseSha = "") {
  return spawnSync(process.execPath, [checker, "--event", event, "--base-sha", baseSha, "--repo", repository], {
    encoding: "utf8"
  });
}

test("single clean root commit passes the root-aware whitespace check", () => {
  const repo = repository();
  commit(repo, "clean.txt", "clean\n");
  const result = check(repo, "push");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /whitespace-check: root-commit/);
});

test("whitespace errors in a root commit fail", () => {
  const repo = repository();
  commit(repo, "bad.txt", "trailing whitespace  \n");
  const result = check(repo, "push");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /trailing whitespace/);
});

test("non-root pushes check only HEAD caret through HEAD", () => {
  const repo = repository();
  commit(repo, "existing.txt", "pre-existing whitespace  \n");
  commit(repo, "new.txt", "clean change\n");
  const result = check(repo, "push");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /whitespace-check: push-range HEAD\^\.\.HEAD/);
});

test("pull requests check changes from the merge base", () => {
  const repo = repository();
  const mergeBase = commit(repo, "base.txt", "base\n");
  git(repo, "switch", "-c", "feature");
  commit(repo, "feature.txt", "bad feature whitespace  \n");
  git(repo, "switch", "main");
  const baseTip = commit(repo, "main.txt", "main change\n");
  git(repo, "switch", "feature");
  const result = check(repo, "pull_request", baseTip);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, new RegExp(`pull-request merge-base=${mergeBase}`));
  assert.match(`${result.stdout}\n${result.stderr}`, /trailing whitespace/);
});

test("workflow delegates whitespace checks without an unguarded HEAD caret diff", () => {
  const source = readFileSync(workflow, "utf8");
  assert.match(source, /node \.github\/scripts\/check-whitespace\.mjs/);
  assert.doesNotMatch(source, /git diff --check HEAD\^/);
});
