import * as core from "@actions/core";

export function validateAuth(): string {
  const apiKey = core.getInput("kiro_api_key", { required: true });
  if (!apiKey.trim()) {
    throw new Error(
      "kiro_api_key is empty. Add KIRO_API_KEY as a repository secret and pass it via the kiro_api_key input.",
    );
  }
  // Values from the secrets context are already masked, but the key may come
  // from elsewhere (e.g. an earlier step's output) — register it explicitly.
  core.setSecret(apiKey);
  return apiKey;
}
