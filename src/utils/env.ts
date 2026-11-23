// Action inputs reach this process as INPUT_<NAME> env vars — including the
// Kiro API key and the GitHub token. Child processes (the vendor install
// script, and the Kiro agent, which runs arbitrary tools under
// --trust-all-tools) don't need them, so they don't get them.
// ACTIONS_RUNTIME_TOKEN authorises the runner's cache and artifact services and
// is only used by this process (@actions/cache).
export function childEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (key.startsWith("INPUT_") || key === "ACTIONS_RUNTIME_TOKEN") continue;
    env[key] = value;
  }
  return env;
}
