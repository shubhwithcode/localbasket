const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const mysqlBaseDir = "C:\\Program Files\\MySQL\\MySQL Server 8.0";
const mysqldPath = path.join(mysqlBaseDir, "bin", "mysqld.exe");
const mysqlClientPath = path.join(mysqlBaseDir, "bin", "mysql.exe");
const dataRoot = path.join(rootDir, ".mysql-data");
const dataDir = path.join(dataRoot, "data");
const configPath = path.join(dataRoot, "my.ini");
const dbPort = 3307;
const dbHost = "127.0.0.1";
const dbName = "localbasket";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureConfigFile() {
  ensureDir(dataRoot);
  const config = [
    "[client]",
    `port=${dbPort}`,
    "",
    "[mysqld]",
    `basedir=${mysqlBaseDir.replace(/\\/g, "/")}`,
    `datadir=${dataDir.replace(/\\/g, "/")}`,
    `port=${dbPort}`,
    "bind-address=127.0.0.1",
    "mysqlx=0",
    "default-storage-engine=INNODB",
    'sql-mode="ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"'
  ].join("\n");
  fs.writeFileSync(configPath, config, "utf8");
}

function pathExists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, host, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect(port, host)) return true;
    await wait(1000);
  }
  return false;
}

function runCommand(file, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${label} failed with code ${code}\n${stderr || stdout}`));
    });
  });
}

async function initializeDataDirIfNeeded() {
  ensureDir(dataDir);
  const mysqlSystemDir = path.join(dataDir, "mysql");
  if (pathExists(mysqlSystemDir)) return;

  console.log("Initializing portable local MySQL data directory...");
  await runCommand(
    mysqldPath,
    [
      "--initialize-insecure",
      `--basedir=${mysqlBaseDir}`,
      `--datadir=${dataDir}`
    ],
    "MySQL initialization"
  );
}

function startMysqlServer() {
  console.log(`Starting portable local MySQL on ${dbHost}:${dbPort}...`);
  const child = spawn(
    "cmd.exe",
    [
      "/c",
      `"${mysqldPath}" --defaults-file="${configPath}" --console`
    ],
    {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  child.stdout.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(`[mysqld] ${text}`);
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(`[mysqld] ${text}`);
  });

  child.on("exit", (code) => {
    if (code !== null) {
      console.error(`Portable MySQL exited with code ${code}`);
    }
  });

  return child;
}

async function ensureDatabaseExists() {
  console.log(`Ensuring database '${dbName}' exists...`);
  await runCommand(
    mysqlClientPath,
    [
      "-u",
      "root",
      "-h",
      dbHost,
      "-P",
      String(dbPort),
      "-e",
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
    ],
    "Database creation"
  );
}

function startBackend(mysqlChild) {
  console.log("Starting LocalBasket backend...");
  const child = spawn(process.execPath, [path.join(rootDir, "backend", "server.js")], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  const shutdown = () => {
    if (!child.killed) child.kill();
    if (mysqlChild && !mysqlChild.killed) mysqlChild.kill();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", shutdown);

  child.on("exit", (code) => {
    shutdown();
    process.exit(code || 0);
  });
}

async function main() {
  if (!pathExists(mysqldPath) || !pathExists(mysqlClientPath)) {
    throw new Error("MySQL 8.0 binaries not found in Program Files.");
  }

  ensureConfigFile();
  await initializeDataDirIfNeeded();

  let mysqlChild = null;
  const alreadyRunning = await canConnect(dbPort, dbHost);
  if (!alreadyRunning) {
    mysqlChild = startMysqlServer();
    const ready = await waitForPort(dbPort, dbHost, 20000);
    if (!ready) {
      throw new Error("Portable local MySQL did not become ready on port 3307.");
    }
  } else {
    console.log(`Using existing MySQL instance on ${dbHost}:${dbPort}.`);
  }

  await ensureDatabaseExists();
  startBackend(mysqlChild);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
