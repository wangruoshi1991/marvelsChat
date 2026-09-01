#!/usr/bin/env node

import {
  CreatorKitError,
  createCreatorPackage,
  createIntakeReceipt,
  sealCreatorPackage,
  validateCreatorPackage,
  verifyCreatorPackage,
} from "./creator-kit-lib.mjs";

const secretOptionPattern = /(?:api[-_]?key|token|password|secret|credential|access[-_]?key)/i;

function parseOptions(argv, valueOptions, flagOptions = []) {
  const values = new Set(valueOptions);
  const flags = new Set(flagOptions);
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const rawName = token.slice(2);
    const separator = rawName.indexOf("=");
    const name = separator < 0 ? rawName : rawName.slice(0, separator);
    if (secretOptionPattern.test(name)) throw new CreatorKitError("secret_option_not_allowed", `Option --${name} is not allowed.`);
    if (separator >= 0) throw new CreatorKitError("option_syntax_invalid", `Option --${name} must use a separate value.`);
    if (flags.has(name)) {
      if (result[name] !== undefined) throw new CreatorKitError("duplicate_option", `Option --${name} may only be used once.`);
      result[name] = true;
      continue;
    }
    if (!values.has(name)) throw new CreatorKitError("unsupported_option", `Option --${name} is not supported.`);
    if (result[name] !== undefined) throw new CreatorKitError("duplicate_option", `Option --${name} may only be used once.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CreatorKitError("option_value_missing", `Option --${name} requires a value.`);
    result[name] = value;
    index += 1;
  }
  return result;
}

function output(value, format) {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${value.command}: ${value.status}\n`);
  if (value.agentKey) process.stdout.write(`agent: ${value.agentKey}\n`);
  if (value.packageDigest) process.stdout.write(`digest: ${value.packageDigest}\n`);
  for (const warning of value.warnings || []) process.stdout.write(`warning: ${warning}\n`);
}

async function run(argv) {
  const [command, ...remaining] = argv;
  if (!command) throw new CreatorKitError("command_required", "Use init, check, seal, verify or intake.");
  if (command === "init") {
    const options = parseOptions(remaining, ["output", "key", "name", "creator", "goal", "profiles", "payer", "budget-cny", "format"]);
    if (options._.length > 0) throw new CreatorKitError("unexpected_argument", "The init command received an unexpected argument.");
    const result = await createCreatorPackage({
      outputDirectory: options.output,
      key: options.key,
      name: options.name,
      creator: options.creator,
      goal: options.goal,
      profiles: options.profiles ? options.profiles.split(",").filter(Boolean) : ["conversational"],
      payer: options.payer,
      budgetCny: options["budget-cny"] === undefined ? undefined : Number(options["budget-cny"]),
    });
    return { result, format: options.format || "text" };
  }
  if (!["check", "seal", "verify", "intake"].includes(command)) throw new CreatorKitError("unsupported_command", "Use init, check, seal, verify or intake.");
  const options = parseOptions(remaining, ["format"], command === "seal" ? ["attest-owner"] : []);
  if (options._.length !== 1) throw new CreatorKitError("package_path_required", `The ${command} command requires exactly one package directory.`);
  const actions = {
    check: validateCreatorPackage,
    seal: (packageDirectory) => sealCreatorPackage(packageDirectory, {
      ownsOrMaySubmitContent: options["attest-owner"] === true,
    }),
    verify: verifyCreatorPackage,
    intake: createIntakeReceipt,
  };
  return { result: await actions[command](options._[0]), format: options.format || "text" };
}

try {
  const { result, format } = await run(process.argv.slice(2));
  output(result, format);
} catch (error) {
  const safeError = error instanceof CreatorKitError
    ? { code: error.code, message: error.message, retryable: false }
    : { code: "creator_kit_failure", message: "The creator-kit command failed.", retryable: false };
  const wantsJson = process.argv.includes("--format") && process.argv[process.argv.indexOf("--format") + 1] === "json";
  const body = wantsJson ? `${JSON.stringify(safeError, null, 2)}\n` : `${safeError.code}: ${safeError.message}\n`;
  process.stderr.write(body);
  process.exitCode = error instanceof CreatorKitError ? error.exitCode : 1;
}
