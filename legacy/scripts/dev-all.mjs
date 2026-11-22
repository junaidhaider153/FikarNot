import { spawn } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev:server"], { stdio: "inherit", env: process.env, shell: true }),
  spawn(npm, ["run", "dev:frontend"], { stdio: "inherit", env: process.env, shell: true }),
];

const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);
