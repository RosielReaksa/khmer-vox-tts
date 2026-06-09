import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneDir = path.resolve(projectRoot, ".next", "standalone");
const expectedPrefix = `${path.resolve(projectRoot, ".next")}${path.sep}`;

if (!standaloneDir.startsWith(expectedPrefix)) {
  throw new Error("Refusing to sanitize a standalone directory outside .next.");
}

let entries = [];
try {
  entries = await readdir(standaloneDir);
} catch {
  process.exit(0);
}

for (const entry of entries) {
  if (entry === ".env" || entry.startsWith(".env.")) {
    await rm(path.join(standaloneDir, entry), { force: true });
  }
}

const serverDir = path.join(standaloneDir, ".next", "server");
const nodeModulesDir = path.join(standaloneDir, "node_modules");
const pgSourceDir = path.join(nodeModulesDir, "pg");
const externalPgAliases = new Set();

async function collectPgAliases(dir) {
  let children = [];
  try {
    children = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    children.map(async (child) => {
      const childPath = path.join(dir, child.name);
      if (child.isDirectory()) {
        await collectPgAliases(childPath);
        return;
      }
      if (!child.name.endsWith(".nft.json")) return;
      const content = await readFile(childPath, "utf8");
      for (const match of content.matchAll(/node_modules\/(pg-[a-f0-9]{12,})/g)) {
        externalPgAliases.add(match[1]);
      }
    }),
  );
}

await collectPgAliases(serverDir);

for (const alias of externalPgAliases) {
  await mkdir(nodeModulesDir, { recursive: true });
  await cp(pgSourceDir, path.join(nodeModulesDir, alias), { recursive: true, force: true });
}
