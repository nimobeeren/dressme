import { execSync } from "node:child_process";

// Find containers by image name prefix (the image may have a dynamic tag like :bcaff440)
const imageName = "cloudflare-dev/dressmeapi";
const command = `docker ps --format "{{.ID}} {{.Image}}"`;
const output = execSync(command, { encoding: "utf8" }).trim();
const containerIds = output
  .split("\n")
  .filter((line) => line.includes(imageName))
  .map((line) => line.split(" ")[0])
  .filter(Boolean);

if (containerIds.length === 0) {
  throw new Error(`No running API container found for ${imageName}. Start wrangler dev first.`);
}

if (containerIds.length > 1) {
  throw new Error(
    `Expected one API container for ${imageName}, found ${containerIds.length}: ${containerIds.join(", ")}`,
  );
}

execSync(`docker logs -f ${containerIds[0]}`, { stdio: "inherit" });
