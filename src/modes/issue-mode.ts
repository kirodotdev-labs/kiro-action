import * as core from "@actions/core";
import * as github from "@actions/github";
import { GithubContext } from "../github/context.js";
import { buildPrompt } from "../prompt/build-prompt.js";
import { runKiro } from "../kiro/runner.js";
import { postProgressComment, updateComment } from "../github/comment.js";
import {
  createBranch,
  commitAndPush,
  getDefaultBranch,
  openPullRequest,
} from "../github/pr.js";
import { parseKiroOutput } from "../utils/extract-output.js";

export type IssueTriggerSource = "assign" | "label";

type Octokit = ReturnType<typeof github.getOctokit>;

async function hasWriteAccess(
  octokit: Octokit,
  owner: string,
  repo: string,
  username: string
): Promise<boolean> {
  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return ["admin", "write"].includes(data.permission);
  } catch {
    return false;
  }
}

export async function runIssueMode(
  ctx: GithubContext,
  apiKey: string,
  triggerSource: IssueTriggerSource
): Promise<{ branchName?: string; prUrl?: string; output: string }> {
  const token = core.getInput("github_token", { required: true });
  const octokit = github.getOctokit(token);
  const issueNumber = ctx.prNumber ?? ctx.issueNumber!;

  // Label trigger has broader permissions than assign — gate it on write access.
  // Assign trigger is implicitly gated by GitHub's own assignee permission model.
  if (triggerSource === "label" && ctx.sender) {
    const allowed = await hasWriteAccess(octokit, ctx.owner, ctx.repo, ctx.sender);
    if (!allowed) {
      core.info(`User ${ctx.sender} lacks write access — ignoring label trigger.`);
      return { output: "" };
    }
  }

  const commentId = await postProgressComment(octokit, ctx.owner, ctx.repo, issueNumber);

  try {
    const userRequest = ctx.issueBody ?? ctx.prBody ?? "";
    const prompt = await buildPrompt(ctx, userRequest);
    const { output, exitCode } = await runKiro(prompt, apiKey);

    if (exitCode !== 0) {
      await updateComment(
        octokit, ctx.owner, ctx.repo, commentId,
        `> ❌ Kiro encountered an error (exit code ${exitCode}).\n\n<details><summary>Output</summary>\n\n\`\`\`\n${output}\n\`\`\`\n</details>`
      );
      core.setFailed(`Kiro exited with code ${exitCode}`);
      return { output };
    }

    const { prTitle: extractedTitle, summary } = parseKiroOutput(output);

    const displaySummary = summary ?? output;
    const baseBranch = await getDefaultBranch(octokit, ctx.owner, ctx.repo);
    const branchName = await createBranch("issue", issueNumber);
    const hadChanges = await commitAndPush(
      branchName,
      `chore: kiro changes for #${issueNumber}`,
      `origin/${baseBranch}`
    );

    let prUrl: string | undefined;
    if (hadChanges) {
      const fallbackTitle = ctx.issueTitle ?? ctx.prTitle ?? `Kiro changes for #${issueNumber}`;
      const prTitleFinal = extractedTitle ? `[Kiro] ${extractedTitle}` : `[Kiro] ${fallbackTitle}`;
      prUrl = await openPullRequest(
        octokit, ctx.owner, ctx.repo,
        branchName,
        prTitleFinal,
        `Automated changes from Kiro for #${issueNumber}.\n\n${displaySummary}`,
        baseBranch
      );
    }
    const finalBody = hadChanges
      ? `✅ Kiro has completed the task.${prUrl ? ` [View PR](${prUrl})` : ""}\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`
      : `✅ Kiro completed the task but made no file changes.\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`;

    await updateComment(octokit, ctx.owner, ctx.repo, commentId, finalBody);
    return { branchName: hadChanges ? branchName : undefined, prUrl, output };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateComment(
      octokit, ctx.owner, ctx.repo, commentId,
      `> ❌ Kiro action failed: ${message}\n\nCheck the [workflow run](https://github.com/${ctx.owner}/${ctx.repo}/actions) for details.`
    );
    throw err;
  }
}
