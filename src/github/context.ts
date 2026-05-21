import * as github from "@actions/github";

export type EventType =
  | "issue_comment"
  | "pull_request_review_comment"
  | "issues"
  | "pull_request"
  | "push"
  | "schedule"
  | "workflow_dispatch"
  | "unknown";

export interface GithubContext {
  eventName: EventType;
  owner: string;
  repo: string;
  action?: string;     // payload.action — e.g. "labeled", "assigned", "opened"
  issueNumber?: number;
  prNumber?: number;
  commentBody?: string;
  commentId?: number;
  commentAuthor?: string;
  assignee?: string;
  label?: string;      // name of the label that was just added (when action === "labeled")
  sender?: string;     // user that triggered the event (used for permission checks)
  prDiff?: string;
  issueBody?: string;
  issueTitle?: string;
  prTitle?: string;
  prBody?: string;
}

export function parseGithubContext(
  rawCtx: typeof github.context = github.context
): GithubContext {
  const { eventName, payload, repo } = rawCtx;
  const { owner, repo: repoName } = repo;

  const ctx: GithubContext = {
    eventName: eventName as EventType,
    owner,
    repo: repoName,
    action: payload.action,
    sender: payload.sender?.login,
  };

  switch (eventName) {
    case "issue_comment": {
      const comment = payload.comment;
      const issue = payload.issue;
      ctx.commentBody = comment?.body ?? "";
      ctx.commentId = comment?.id;
      ctx.commentAuthor = comment?.user?.login;
      ctx.issueNumber = issue?.number;
      // A comment on a PR also fires issue_comment — detect by presence of pull_request key
      if (issue?.pull_request) {
        ctx.prNumber = issue.number;
      }
      break;
    }
    case "pull_request_review_comment": {
      const comment = payload.comment;
      const pr = payload.pull_request;
      ctx.commentBody = comment?.body ?? "";
      ctx.commentId = comment?.id;
      ctx.commentAuthor = comment?.user?.login;
      ctx.prNumber = pr?.number;
      ctx.prTitle = pr?.title;
      ctx.prBody = pr?.body;
      break;
    }
    case "issues": {
      const issue = payload.issue;
      ctx.issueNumber = issue?.number;
      ctx.issueTitle = issue?.title;
      ctx.issueBody = issue?.body;
      ctx.assignee = payload.assignee?.login;
      ctx.label = payload.label?.name;
      break;
    }
    case "pull_request": {
      const pr = payload.pull_request;
      ctx.prNumber = pr?.number;
      ctx.prTitle = pr?.title;
      ctx.prBody = pr?.body;
      ctx.assignee = payload.assignee?.login;
      ctx.label = payload.label?.name;
      break;
    }
  }

  return ctx;
}
