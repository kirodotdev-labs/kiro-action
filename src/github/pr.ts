import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";

type Octokit = ReturnType<typeof github.getOctokit>;

function generateTimestamp(): string {
  const now = new Date();
  const YYYY = now.getUTCFullYear();
  const MM = String(now.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(now.getUTCDate()).padStart(2, "0");
  const HH = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return `${YYYY}${MM}${DD}-${HH}${mm}`;
}

export async function createBranch(
  entityType: "issue" | "pr",
  entityNumber: number
): Promise<string> {
  const prefix = core.getInput("branch_prefix") || "kiro/";
  const branchName = `${prefix}${entityType}-${entityNumber}-${generateTimestamp()}`.slice(0, 50);

  await exec.exec("git", ["checkout", "-b", branchName]);
  core.info(`Created branch: ${branchName}`);
  return branchName;
}

export async function checkoutPrBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  const headRef = data.head.ref;

  await exec.exec("git", ["fetch", "origin", headRef]);
  await exec.exec("git", ["checkout", headRef]);
  core.info(`Checked out existing PR branch: ${headRef}`);
  return headRef;
}

export async function commitAndPush(
  branchName: string,
  message: string,
  compareRef: string
): Promise<boolean> {
  await exec.exec("git", ["config", "user.name", "kiro-bot"]);
  await exec.exec("git", ["config", "user.email", "kiro-bot@users.noreply.github.com"]);

  // Commit any working-tree changes Kiro left uncommitted.
  let statusOutput = "";
  await exec.exec("git", ["status", "--porcelain"], {
    listeners: { stdout: (data) => { statusOutput += data.toString(); } },
  });
  if (statusOutput.trim()) {
    await exec.exec("git", ["add", "-A"]);
    await exec.exec("git", ["commit", "-m", message]);
  }

  // Recent versions of Kiro CLI commit changes themselves, so a clean working
  // tree doesn't mean nothing happened. Compare against the ref we'd push to
  // and only skip if there's truly nothing new to publish.
  let countOutput = "";
  await exec.exec("git", ["rev-list", "--count", `${compareRef}..HEAD`], {
    listeners: { stdout: (data) => { countOutput += data.toString(); } },
    ignoreReturnCode: true,
  });
  const commitsAhead = parseInt(countOutput.trim(), 10) || 0;

  if (commitsAhead === 0) {
    core.info(`No new commits ahead of ${compareRef} — skipping push.`);
    return false;
  }

  await exec.exec("git", ["push", "origin", branchName]);
  core.info(`Pushed ${commitsAhead} commit(s) to ${branchName}`);
  return true;
}

export async function openPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  title: string,
  body: string,
  baseBranch: string
): Promise<string> {
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    head: branchName,
    base: baseBranch,
    title,
    body,
  });
  core.info(`Opened PR: ${data.html_url}`);
  return data.html_url;
}

export async function getDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}
