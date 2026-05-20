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

export async function runAssignMode(
  ctx: GithubContext,
  apiKey: string
): Promise<{ branchName?: string; prUrl?: string; output: string }> {
  const token = core.getInput("github_token", { required: true });
  const octokit = github.getOctokit(token);
  const issueNumber = ctx.prNumber ?? ctx.issueNumber!;

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
