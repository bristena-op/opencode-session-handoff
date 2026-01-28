import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import type { PluginInput } from "@opencode-ai/plugin";

const PACKAGE_NAME = "opencode-session-handoff";
const NPM_REGISTRY_URL = `https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`;
const NPM_FETCH_TIMEOUT = 5000;
const BUN_INSTALL_TIMEOUT_MS = 60000;

type PluginClient = PluginInput["client"];

interface UpdateContext {
  directory: string;
  client: PluginClient;
}

function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "opencode");
}

function getConfigPath(): string {
  const configDir = getConfigDir();
  const jsoncPath = path.join(configDir, "opencode.jsonc");
  if (fs.existsSync(jsoncPath)) return jsoncPath;
  return path.join(configDir, "opencode.json");
}

function getCurrentVersion(): string | null {
  try {
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    let dir = currentDir;
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === PACKAGE_NAME && pkg.version) {
          return pkg.version;
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    return null;
  }
  return null;
}

async function getLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT);
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { latest?: string };
    return data.latest ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface PluginEntryInfo {
  entry: string;
  isPinned: boolean;
  pinnedVersion: string | null;
  configPath: string;
}

function findPluginEntry(): PluginEntryInfo | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const pinnedPattern = new RegExp(`["']${PACKAGE_NAME}@([^"']+)["']`);
    const unpinnedPattern = new RegExp(`["']${PACKAGE_NAME}["']`);

    const pinnedMatch = content.match(pinnedPattern);
    if (pinnedMatch) {
      return {
        entry: pinnedMatch[0].slice(1, -1),
        isPinned: true,
        pinnedVersion: pinnedMatch[1],
        configPath,
      };
    }

    const unpinnedMatch = content.match(unpinnedPattern);
    if (unpinnedMatch) {
      return {
        entry: unpinnedMatch[0].slice(1, -1),
        isPinned: false,
        pinnedVersion: null,
        configPath,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function updatePinnedVersion(configPath: string, oldEntry: string, newVersion: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const newEntry = `${PACKAGE_NAME}@${newVersion}`;

    const pluginMatch = content.match(/"plugin"\s*:\s*\[/);
    if (!pluginMatch || pluginMatch.index === undefined) return false;

    const startIdx = pluginMatch.index + pluginMatch[0].length;
    let bracketCount = 1;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length && bracketCount > 0; i++) {
      if (content[i] === "[") bracketCount++;
      else if (content[i] === "]") bracketCount--;
      endIdx = i;
    }

    const before = content.slice(0, startIdx);
    const pluginArrayContent = content.slice(startIdx, endIdx);
    const after = content.slice(endIdx);

    const escapedOldEntry = oldEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`["']${escapedOldEntry}["']`);

    if (!regex.test(pluginArrayContent)) return false;

    const updatedPluginArray = pluginArrayContent.replace(regex, `"${newEntry}"`);
    const updatedContent = before + updatedPluginArray + after;

    if (updatedContent === content) return false;

    fs.writeFileSync(configPath, updatedContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function removePackageDir(configDir: string): boolean {
  const pkgDir = path.join(configDir, "node_modules", PACKAGE_NAME);
  if (fs.existsSync(pkgDir)) {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function removeFromPackageJson(configDir: string): boolean {
  const pkgJsonPath = path.join(configDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return false;

  const content = fs.readFileSync(pkgJsonPath, "utf-8");
  const pkgJson = JSON.parse(content);
  if (pkgJson.dependencies?.[PACKAGE_NAME]) {
    delete pkgJson.dependencies[PACKAGE_NAME];
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
    return true;
  }
  return false;
}

function removeFromBunLock(configDir: string): boolean {
  const lockPath = path.join(configDir, "bun.lock");
  if (!fs.existsSync(lockPath)) return false;

  const content = fs.readFileSync(lockPath, "utf-8");
  const cleanedContent = content.replace(/,(\s*[}\]])/g, "$1");
  const lock = JSON.parse(cleanedContent);
  let modified = false;

  if (lock.workspaces?.[""]?.dependencies?.[PACKAGE_NAME]) {
    delete lock.workspaces[""].dependencies[PACKAGE_NAME];
    modified = true;
  }
  if (lock.packages?.[PACKAGE_NAME]) {
    delete lock.packages[PACKAGE_NAME];
    modified = true;
  }
  if (modified) {
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  }
  return modified;
}

function invalidatePackage(): boolean {
  const configDir = getConfigDir();
  try {
    removePackageDir(configDir);
    removeFromPackageJson(configDir);
    removeFromBunLock(configDir);
    return true;
  } catch {
    return false;
  }
}

async function runBunInstall(): Promise<boolean> {
  try {
    const proc = spawn("bun", ["install"], {
      cwd: getConfigDir(),
      stdio: "pipe",
    });

    const exitPromise = new Promise<number | null>((resolve) => {
      proc.on("close", (code) => resolve(code));
      proc.on("error", () => resolve(null));
    });

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), BUN_INSTALL_TIMEOUT_MS),
    );

    const result = await Promise.race([exitPromise, timeoutPromise]);

    if (result === "timeout") {
      try {
        proc.kill();
      } catch {
        return false;
      }
      return false;
    }

    return result === 0;
  } catch {
    return false;
  }
}

async function showToast(client: PluginClient, message: string): Promise<void> {
  try {
    await client.tui.showToast({ body: { message, variant: "info" } });
  } catch {
    return;
  }
}

async function runUpdateCheck(ctx: UpdateContext): Promise<void> {
  const currentVersion = getCurrentVersion();
  if (!currentVersion) return;

  const latestVersion = await getLatestVersion();
  if (!latestVersion) return;

  if (currentVersion === latestVersion) return;

  const pluginInfo = findPluginEntry();
  if (!pluginInfo) return;

  if (pluginInfo.isPinned) {
    const updated = updatePinnedVersion(pluginInfo.configPath, pluginInfo.entry, latestVersion);
    if (!updated) {
      await showToast(ctx.client, `session-handoff v${latestVersion} available. Update manually.`);
      return;
    }
  }

  invalidatePackage();
  const success = await runBunInstall();

  if (success) {
    await showToast(
      ctx.client,
      `session-handoff updated: v${currentVersion} → v${latestVersion}. Restart to apply.`,
    );
  } else {
    await showToast(ctx.client, `session-handoff v${latestVersion} available. Restart to apply.`);
  }
}

export function createAutoUpdateHook(ctx: UpdateContext) {
  let hasChecked = false;

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
      if (event.type !== "session.created") return;
      if (hasChecked) return;

      const props = event.properties as { info?: { parentID?: string } } | undefined;
      if (props?.info?.parentID) return;

      hasChecked = true;

      setTimeout(() => {
        runUpdateCheck(ctx).catch(() => {});
      }, 100);
    },
  };
}
