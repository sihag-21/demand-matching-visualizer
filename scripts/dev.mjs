import { spawn } from "node:child_process";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || "1000",
    },
  },
);
server.on("exit", (code) => process.exit(code || 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
