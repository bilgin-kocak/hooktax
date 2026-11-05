// Create a fresh TESTNET-ONLY Arkiv writer key in <repo>/.env (gitignored) and print the address.
// The key itself is never printed. Fund the address at https://hub.arkiv.network/faucet.
// Refuses to overwrite an existing ARKIV_PRIVATE_KEY.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = path.join(REPO_ROOT, ".env");

if (!existsSync(envFile)) writeFileSync(envFile, readFileSync(path.join(REPO_ROOT, ".env.example"), "utf8"), { mode: 0o600 });
const env = readFileSync(envFile, "utf8");
const existing = env.match(/^ARKIV_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m);
if (existing) {
  console.log(`ARKIV_PRIVATE_KEY already set; writer address ${privateKeyToAccount(existing[1] as `0x${string}`).address}`);
  process.exit(0);
}
const key = generatePrivateKey();
const address = privateKeyToAccount(key).address;
const next = /^ARKIV_PRIVATE_KEY=\s*$/m.test(env)
  ? env.replace(/^ARKIV_PRIVATE_KEY=\s*$/m, `ARKIV_PRIVATE_KEY=${key}`)
  : `${env.trimEnd()}\nARKIV_PRIVATE_KEY=${key}\n`;
writeFileSync(envFile, next, { mode: 0o600 });
if (!/^VITE_ARKIV_WRITER_ADDRESS=.+$/m.test(next)) {
  const withWriter = next.replace(/^VITE_ARKIV_WRITER_ADDRESS=\s*$/m, `VITE_ARKIV_WRITER_ADDRESS=${address}`);
  writeFileSync(envFile, withWriter === next ? `${next.trimEnd()}\nVITE_ARKIV_WRITER_ADDRESS=${address}\n` : withWriter, { mode: 0o600 });
}
appendFileSync(envFile, "");
console.log(`new testnet writer address: ${address}`);
console.log("fund it with tGLM at https://hub.arkiv.network/faucet (the key is in .env, which is gitignored)");
