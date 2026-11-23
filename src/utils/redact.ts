// GitHub masks registered secrets in workflow logs, but not in text the action
// posts through the API (issue/PR comments, PR bodies) or sets as an output.
// Scrub credentials from anything Kiro printed before it leaves the runner.
const MASK = "***";

// Very short values can't be real credentials and would mangle ordinary text.
const MIN_SECRET_LENGTH = 8;

export function redact(
  text: string,
  secrets: Array<string | undefined>,
): string {
  let out = text;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (value && value.length >= MIN_SECRET_LENGTH) {
      out = out.split(value).join(MASK);
    }
  }
  return out;
}
