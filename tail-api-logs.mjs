import { execSync } from "node:child_process";

// Find containers by image name prefix (the image may have a dynamic tag like :bcaff440)
const imageName = "cloudflare-dev/dressme";
const command = `docker ps --format "{{.ID}} {{.Image}}"`;
const output = execSync(command, { encoding: "utf8" }).trim();
const containerIds = output
  .split("\n")
  .filter((line) => line.includes(imageName))
  .map((line) => line.split(" ")[0])
  .filter(Boolean);

if (containerIds.length === 0) {
  throw new Error(
    `No running API container found for ${imageName}. Make sure you run \`pnpm run dev\` and make a request to the client to start the container.`,
  );
}

if (containerIds.length > 1) {
  throw new Error(
    `Expected one API container for ${imageName}, found ${containerIds.length}: ${containerIds.join(", ")}`,
  );
}

execSync(`docker logs -f ${containerIds[0]}`, { stdio: "inherit" });
