import * as core from "@actions/core";
import * as github from "@actions/github";
import { GithubContext } from "../github/context.js";
import { buildPrompt } from "../prompt/build-prompt.js";
import { runKiro } from "../kiro/runner.js";
import {
  findExistingKiroComment,
  postProgressComment,
  updateComment,
} from "../github/comment.js";
import {
  createBranch,
  checkoutPrBranch,
  commitAndPush,
  getDefaultBranch,
  openPullRequest,
} from "../github/pr.js";
import { parseKiroOutput } from "../utils/extract-output.js";

export async function runCommentMode(
  ctx: GithubContext,
  apiKey: string
): Promise<{ branchName?: string; prUrl?: string; output: string }> {
  const token = core.getInput("github_token", { required: true });
  const octokit = github.getOctokit(token);
  const issueNumber = ctx.prNumber ?? ctx.issueNumber!;

  // Validate commenter has write access
  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner: ctx.owner,
      repo: ctx.repo,
      username: ctx.commentAuthor!,
    });
    const level = data.permission;
    if (!["admin", "write"].includes(level)) {
      core.info(`User ${ctx.commentAuthor} has "${level}" permission — ignoring trigger.`);
      return { output: "" };
    }
  } catch {
    core.info(`Could not verify permissions for ${ctx.commentAuthor} — ignoring trigger.`);
    return { output: "" };
  }

  // Post/reuse progress comment — from this point on, always update it on exit
  let commentId = await findExistingKiroComment(octokit, ctx.owner, ctx.repo, issueNumber);
  if (commentId) {
    await updateComment(octokit, ctx.owner, ctx.repo, commentId, "> Kiro is working on this... ⚙️");
  } else {
    commentId = await postProgressComment(octokit, ctx.owner, ctx.repo, issueNumber);
  }

  try {
    const prompt = await buildPrompt(ctx, "");
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

    const isOnPr = !!ctx.prNumber;
    let branchName: string;
    let prUrl: string | undefined;

    if (isOnPr) {
      // Comment on an existing PR — push to its branch directly
      branchName = await checkoutPrBranch(octokit, ctx.owner, ctx.repo, ctx.prNumber!);
      const hadChanges = await commitAndPush(
        branchName,
        `chore: kiro changes for #${issueNumber}`,
        `origin/${branchName}`
      );

      const prHtmlUrl = `https://github.com/${ctx.owner}/${ctx.repo}/pull/${ctx.prNumber}`;
      const finalBody = hadChanges
        ? `✅ Kiro pushed changes to this PR. [View PR](${prHtmlUrl})\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`
        : `✅ Kiro completed the task but made no file changes.\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`;

      await updateComment(octokit, ctx.owner, ctx.repo, commentId, finalBody);
      return { branchName: hadChanges ? branchName : undefined, prUrl: hadChanges ? prHtmlUrl : undefined, output };

    } else {
      // Comment on an issue — create a fresh timestamped branch and open a PR
      const baseBranch = await getDefaultBranch(octokit, ctx.owner, ctx.repo);
      branchName = await createBranch("issue", issueNumber);
      const hadChanges = await commitAndPush(
        branchName,
        `chore: kiro changes for #${issueNumber}`,
        `origin/${baseBranch}`
      );

      if (hadChanges) {
        const fallbackTitle = ctx.issueTitle ?? `Kiro changes for #${issueNumber}`;
        const prTitleFinal = extractedTitle ? `[Kiro] ${extractedTitle}` : `[Kiro] ${fallbackTitle}`;
        prUrl = await openPullRequest(
          octokit, ctx.owner, ctx.repo,
          branchName,
          prTitleFinal,
          `Automated changes from Kiro in response to #${issueNumber}.\n\n${displaySummary}`,
          baseBranch
        );
      }

      const finalBody = hadChanges
        ? `✅ Kiro has completed the task.${prUrl ? ` [View PR](${prUrl})` : ""}\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`
        : `✅ Kiro completed the task but made no file changes.\n\n<details><summary>Summary</summary>\n\n${displaySummary}\n</details>`;

      await updateComment(octokit, ctx.owner, ctx.repo, commentId, finalBody);
      return { branchName: hadChanges ? branchName : undefined, prUrl, output };
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateComment(
      octokit, ctx.owner, ctx.repo, commentId,
      `> ❌ Kiro action failed: ${message}\n\nCheck the [workflow run](https://github.com/${ctx.owner}/${ctx.repo}/actions) for details.`
    );
    throw err;
  }
}
