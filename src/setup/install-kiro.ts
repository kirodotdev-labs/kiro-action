import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MANIFEST_URL =
  "https://prod.download.cli.kiro.dev/stable/latest/manifest.json";
const INSTALL_SCRIPT_URL = "https://cli.kiro.dev/install";
const KIRO_BIN_DIR = path.join(os.homedir(), ".local", "bin");
const KIRO_BINARY = path.join(KIRO_BIN_DIR, "kiro-cli");

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * Normalises the `kiro_version` input. Returns undefined for "latest" (or an
 * empty input), otherwise a bare semver such as "3.5.0".
 */
export function parseRequestedVersion(input: string): string | undefined {
  const value = input.trim();
  if (!value || value.toLowerCase() === "latest") return undefined;
  const version = value.replace(/^v/, "");
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `Invalid kiro_version "${value}". Use "latest" or a full version such as "3.5.0".`,
    );
  }
  return version;
}

/** Arguments for the official install script. */
export function buildInstallScriptArgs(version: string | undefined): string[] {
  // --force: the script refuses to replace an existing install when there is no
  // TTY to confirm on, which breaks self-hosted runners after a version bump.
  // --no-modify-path: we add the bin dir to PATH via core.addPath instead of
  // editing the runner user's shell startup files.
  const args = ["--force", "--no-modify-path"];
  if (version) args.push("--version", version);
  return args;
}

async function resolveLatestVersion(): Promise<string> {
  // The manifest is only published for the latest release, so it's used purely
  // to resolve the current version string for cache keying.
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Kiro CLI manifest: ${response.status} ${response.statusText}`,
    );
  }
  const manifest = (await response.json()) as { version?: string };
  if (!manifest.version)
    throw new Error("Kiro CLI manifest did not include a version field");
  return manifest.version;
}

export async function installKiro(): Promise<void> {
  const requested = parseRequestedVersion(core.getInput("kiro_version"));
  const version = requested ?? (await resolveLatestVersion());
  const cacheKey = `kiro-cli-${version}-${process.platform}-${process.arch}`;

  const cacheHit = await cache.restoreCache([KIRO_BIN_DIR], cacheKey);
  if (cacheHit && fs.existsSync(KIRO_BINARY)) {
    core.addPath(KIRO_BIN_DIR);
    core.info(`Kiro CLI ${version} restored from cache.`);
    return;
  }

  // The official install script resolves the right archive for the platform
  // (including the musl fallback on older glibc) and verifies its checksum.
  // Script arguments are passed positionally via "$@" rather than interpolated
  // into the command string.
  core.info(`Installing Kiro CLI ${version} via official install script...`);
  await exec.exec(
    "bash",
    [
      "-c",
      `curl -fsSL ${INSTALL_SCRIPT_URL} | bash -s -- "$@"`,
      "bash",
      ...buildInstallScriptArgs(requested),
    ],
    {
      env: {
        ...process.env,
        KIRO_CLI_SKIP_SETUP: "1",
      },
    },
  );

  if (!fs.existsSync(KIRO_BINARY)) {
    throw new Error(
      `Kiro CLI installation failed: binary not found at ${KIRO_BINARY}`,
    );
  }

  core.addPath(KIRO_BIN_DIR);
  core.info(`Kiro CLI ${version} installed successfully.`);
  // Log what actually landed — the cache key comes from the manifest, which
  // could lag a release published mid-install.
  await exec.exec(KIRO_BINARY, ["--version"]);

  await cache.saveCache([KIRO_BIN_DIR], cacheKey);
}
