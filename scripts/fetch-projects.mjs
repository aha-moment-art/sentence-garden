// Reproduce the public source snapshots without downloading audio or reading tokens.
// Requires Node 22+ and the GitHub CLI. Destination must be outside the repository.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = process.argv[2];
if (
  !destination ||
  !isAbsolute(destination) ||
  !relative(root, destination).startsWith("..")
)
  throw Error("Pass an absolute snapshot directory outside this repository.");
const { revisions } = JSON.parse(
  await readFile(resolve(root, "public/library/index.json"), "utf8"),
);
for (const { repo, commit } of Object.values(revisions)) {
  const folder = resolve(destination, repo);
  await mkdir(folder, { recursive: true });
  const tree = JSON.parse(
    execFileSync(
      "gh",
      ["api", `repos/aha-moment-art/${repo}/git/trees/${commit}?recursive=1`],
      { maxBuffer: 50 * 1024 * 1024, encoding: "utf8" },
    ),
  );
  if (tree.truncated) throw Error("Incomplete source tree: " + repo);
  await writeFile(resolve(folder, "tree.json"), JSON.stringify(tree));
  await writeFile(
    resolve(folder, "revision.json"),
    JSON.stringify({ repo, commit }),
  );
  const selected = tree.tree.filter(
    (f) =>
      f.type === "blob" &&
      ((repo === "WordLeap" &&
        (f.path.startsWith("public/dicts/") ||
          f.path.startsWith("THIRD_PARTY") ||
          f.path === "app/word-bank.ts")) ||
        (repo === "british-ear" &&
          ["sentences.js", "youtube-sentences.js"].includes(f.path)) ||
        (repo === "BritSpeak" && f.path === "app.js") ||
        (repo === "level-up-cards" && f.path === "calendar.html")),
  );
  for (const file of selected) {
    const response = await fetch(
      `https://raw.githubusercontent.com/aha-moment-art/${repo}/${commit}/${file.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (!response.ok)
      throw Error(
        `Source fetch failed: ${repo}/${file.path} (${response.status})`,
      );
    const target = resolve(folder, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  console.log(`${repo}: ${selected.length} source files at ${commit}`);
}
