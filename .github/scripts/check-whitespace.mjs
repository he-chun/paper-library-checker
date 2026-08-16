import { spawnSync } from "node:child_process";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

const eventName = argument("--event") || process.env.PLC_EVENT_NAME;
const pullRequestBase = argument("--base-sha") || process.env.PLC_PR_BASE_SHA;
const repository = argument("--repo") || process.cwd();

function git(args, { quiet = false } = {}) {
  const result = spawnSync("git", args, { cwd: repository, encoding: "utf8" });
  if (!quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result;
}

function checkedGit(args) {
  const result = git(args);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

if (eventName === "pull_request") {
  if (!pullRequestBase) throw new Error("PLC_PR_BASE_SHA is required for pull_request checks");
  const mergeBase = checkedGit(["merge-base", pullRequestBase, "HEAD"]);
  console.log(`whitespace-check: pull-request merge-base=${mergeBase}`);
  checkedGit(["diff", "--check", `${mergeBase}..HEAD`]);
} else {
  const parent = git(["rev-parse", "--verify", "HEAD^"], { quiet: true });
  if (parent.error) throw parent.error;
  if (parent.status === 0) {
    console.log("whitespace-check: push-range HEAD^..HEAD");
    checkedGit(["diff", "--check", "HEAD^..HEAD"]);
  } else {
    console.log("whitespace-check: root-commit");
    checkedGit(["diff-tree", "--check", "--root", "-r", "HEAD"]);
  }
}
