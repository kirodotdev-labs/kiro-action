import * as core from "@actions/core";
import { GithubContext } from "../github/context.js";

export type Mode = "comment" | "label" | "assign" | "auto" | "skip";

export function detectMode(ctx: GithubContext): Mode {
  const explicitPrompt = core.getInput("prompt");
  const triggerPhrase = core.getInput("trigger_phrase") || "@kiro";
  const labelTrigger = core.getInput("label_trigger") || "kiro";
  const assigneeTrigger = core.getInput("assignee_trigger") || "kiro";

  // auto-mode: explicit prompt always wins
  if (explicitPrompt.trim()) {
    core.debug("Mode: auto (explicit prompt input provided)");
    return "auto";
  }

  // comment-mode: trigger phrase mentioned in a comment
  if (
    (ctx.eventName === "issue_comment" || ctx.eventName === "pull_request_review_comment") &&
    ctx.commentBody?.includes(triggerPhrase)
  ) {
    core.debug(`Mode: comment (trigger phrase "${triggerPhrase}" found in comment)`);
    return "comment";
  }

  // label-mode: trigger label added to an issue or PR
  if (
    (ctx.eventName === "issues" || ctx.eventName === "pull_request") &&
    ctx.action === "labeled" &&
    ctx.label?.toLowerCase() === labelTrigger.toLowerCase()
  ) {
    core.debug(`Mode: label (label "${ctx.label}" matches trigger)`);
    return "label";
  }

  // assign-mode: issue or PR assigned to the trigger user
  if (
    (ctx.eventName === "issues" || ctx.eventName === "pull_request") &&
    ctx.assignee?.toLowerCase() === assigneeTrigger.toLowerCase()
  ) {
    core.debug(`Mode: assign (assignee "${ctx.assignee}" matches trigger)`);
    return "assign";
  }

  core.info("No trigger matched — skipping.");
  return "skip";
}
