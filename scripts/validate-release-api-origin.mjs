import { existsSync, realpathSync } from "node:fs";
import { BlockList, isIP } from "node:net";
import { fileURLToPath } from "node:url";

const nonPublicIPv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  nonPublicIPv4.addSubnet(address, prefix, "ipv4");
}

const globalUnicastIPv6 = new BlockList();
globalUnicastIPv6.addSubnet("2000::", 3, "ipv6");
const specialPurposeIPv6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
]) {
  specialPurposeIPv6.addSubnet(address, prefix, "ipv6");
}

const localDomainSuffixes = [
  "localhost", "local", "internal", "lan", "home", "home.arpa",
  "test", "invalid", "example", "onion", "alt",
];

const invalid = (reason) => {
  // Build logs must never include an input URL, which may contain credentials.
  throw new Error(`Release API origin ${reason}`);
};

/** Validate literal addresses and hostname syntax without DNS or network access. */
export function validateReleaseApiOrigin(value) {
  if (typeof value !== "string" || value.length === 0 || /[\s\\%]/u.test(value)) {
    invalid("must be an explicit HTTPS origin without whitespace or URL escapes.");
  }
  const match = /^https:\/\/(\[[0-9a-f:.]+\]|[^:/?#@]+)(?::([0-9]+))?\/?$/iu.exec(value);
  if (!match) {
    invalid("must use HTTPS with no credentials, path, query, or fragment.");
  }
  const [, rawHostname, port] = match;
  if (port && (!/^[1-9][0-9]{0,4}$/u.test(port) || Number(port) > 65535)) {
    invalid("has an invalid port.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invalid("is not a valid HTTPS origin.");
  }
  const hostname = rawHostname.toLowerCase();
  const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    if (nonPublicIPv4.check(address, "ipv4")) {
      invalid("must not use a local or reserved IPv4 address.");
    }
  } else if (ipVersion === 6) {
    // Restrict to ordinary global unicast. This also excludes mapped IPv4,
    // translation prefixes, loopback, ULA, link-local, and multicast forms.
    if (!globalUnicastIPv6.check(address, "ipv6") || specialPurposeIPv6.check(address, "ipv6")) {
      invalid("must not use a local or reserved IPv6 address.");
    }
  } else {
    // WHATWG URL parsing expands shorthand/hex/octal numeric hosts. Require a
    // real DNS hostname here so those alternate IP spellings cannot bypass CIDRs.
    const domain = hostname.replace(/\.$/u, "");
    const labels = domain.split(".");
    if (parsed.hostname.toLowerCase() !== hostname || domain.length > 253 || labels.length < 2
      || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) {
      invalid("must use a standard IP literal or DNS hostname.");
    }
    if (localDomainSuffixes.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) {
      invalid("must not use a local or reserved hostname.");
    }
  }
  return parsed.origin;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const environmentKey = args.length === 0 ? "MIAOXUN_API_BASE_URL"
      : args.length === 2 && args[0] === "--env" && /^[A-Z_][A-Z0-9_]*$/u.test(args[1]) ? args[1] : null;
    if (!environmentKey) {
      invalid("validator usage: --env ENVIRONMENT_VARIABLE_NAME.");
    }
    validateReleaseApiOrigin(process.env[environmentKey]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
