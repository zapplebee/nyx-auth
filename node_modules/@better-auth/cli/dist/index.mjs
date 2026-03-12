#!/usr/bin/env node
import { i as getPackageInfo, n as generateSchema } from "./generators-Ht8QYIi_.mjs";
import { Command } from "commander";
import * as fs$2 from "node:fs";
import fs, { existsSync, readFileSync } from "node:fs";
import fs$1 from "node:fs/promises";
import * as path$1 from "node:path";
import path from "node:path";
import { createTelemetry, getTelemetryAuthConfig } from "@better-auth/telemetry";
import { getAdapter, getMigrations } from "better-auth/db";
import chalk from "chalk";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4";
import { format } from "prettier";
import babelPresetReact from "@babel/preset-react";
import babelPresetTypeScript from "@babel/preset-typescript";
import { BetterAuthError } from "@better-auth/core/error";
import { loadConfig } from "c12";
import { exec, execSync } from "node:child_process";
import * as os$1 from "node:os";
import os from "node:os";
import { cancel, confirm, intro, isCancel, log, multiselect, outro, select, spinner, text } from "@clack/prompts";
import { parse } from "dotenv";
import semver from "semver";
import Crypto from "node:crypto";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import open from "open";
import { base64 } from "@better-auth/utils/base64";
import "dotenv/config";

//#region src/utils/add-cloudflare-modules.ts
const createModule = () => {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
const createStub = (label) => {
  const handler = {
    get(_, prop) {
      if (prop === "toString") return () => label;
      if (prop === "valueOf") return () => label;
      if (prop === Symbol.toPrimitive) return () => label;
      if (prop === Symbol.toStringTag) return "Object";
      if (prop === "then") return undefined;
      return createStub(label + "." + String(prop));
    },
    apply(_, __, args) {
      return createStub(label + "()")
    },
    construct() {
      return createStub(label + "#instance");
    },
  };
  const fn = () => createStub(label + "()");
  return new Proxy(fn, handler);
};

class WorkerEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

class DurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
}

class RpcTarget {
  constructor(value) {
    this.value = value;
  }
}

const RpcStub = RpcTarget;

const env = createStub("env");
const caches = createStub("caches");
const scheduler = createStub("scheduler");
const executionCtx = createStub("executionCtx");

export { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint, caches, env, executionCtx, scheduler };

const defaultExport = {
  DurableObject,
  RpcStub,
  RpcTarget,
  WorkerEntrypoint,
  caches,
  env,
  executionCtx,
  scheduler,
};

export default defaultExport;
// jiti dirty hack: .unknown
`)}`;
};
const CLOUDFLARE_STUB_MODULE = createModule();
function addCloudflareModules(aliases, _cwd) {
	if (!aliases["cloudflare:workers"]) aliases["cloudflare:workers"] = CLOUDFLARE_STUB_MODULE;
	if (!aliases["cloudflare:test"]) aliases["cloudflare:test"] = CLOUDFLARE_STUB_MODULE;
}

//#endregion
//#region src/utils/add-svelte-kit-env-modules.ts
/**
* Adds SvelteKit environment modules and path aliases
* @param aliases - The aliases object to populate
* @param cwd - Current working directory (optional, defaults to process.cwd())
*/
function addSvelteKitEnvModules(aliases, cwd) {
	const workingDir = cwd || process.cwd();
	aliases["$env/dynamic/private"] = createDataUriModule(createDynamicEnvModule());
	aliases["$env/dynamic/public"] = createDataUriModule(createDynamicEnvModule());
	aliases["$env/static/private"] = createDataUriModule(createStaticEnvModule(filterPrivateEnv("PUBLIC_", "")));
	aliases["$env/static/public"] = createDataUriModule(createStaticEnvModule(filterPublicEnv("PUBLIC_", "")));
	const svelteKitAliases = getSvelteKitPathAliases(workingDir);
	Object.assign(aliases, svelteKitAliases);
}
function getSvelteKitPathAliases(cwd) {
	const aliases = {};
	const packageJsonPath = path.join(cwd, "package.json");
	const svelteConfigPath = path.join(cwd, "svelte.config.js");
	const svelteConfigTsPath = path.join(cwd, "svelte.config.ts");
	let isSvelteKitProject = false;
	if (fs.existsSync(packageJsonPath)) try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		isSvelteKitProject = !!{
			...packageJson.dependencies,
			...packageJson.devDependencies
		}["@sveltejs/kit"];
	} catch {}
	if (!isSvelteKitProject) isSvelteKitProject = fs.existsSync(svelteConfigPath) || fs.existsSync(svelteConfigTsPath);
	if (!isSvelteKitProject) return aliases;
	const libPaths = [path.join(cwd, "src", "lib"), path.join(cwd, "lib")];
	for (const libPath of libPaths) if (fs.existsSync(libPath)) {
		aliases["$lib"] = libPath;
		for (const subPath of [
			"server",
			"utils",
			"components",
			"stores"
		]) {
			const subDir = path.join(libPath, subPath);
			if (fs.existsSync(subDir)) aliases[`$lib/${subPath}`] = subDir;
		}
		break;
	}
	aliases["$app/server"] = createDataUriModule(createAppServerModule());
	const customAliases = getSvelteConfigAliases(cwd);
	Object.assign(aliases, customAliases);
	return aliases;
}
function getSvelteConfigAliases(cwd) {
	const aliases = {};
	const configPaths = [path.join(cwd, "svelte.config.js"), path.join(cwd, "svelte.config.ts")];
	for (const configPath of configPaths) if (fs.existsSync(configPath)) {
		try {
			const aliasMatch = fs.readFileSync(configPath, "utf-8").match(/alias\s*:\s*\{([^}]+)\}/);
			if (aliasMatch && aliasMatch[1]) {
				const aliasMatches = aliasMatch[1].matchAll(/['"`](\$[^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g);
				for (const match of aliasMatches) {
					const [, alias, target] = match;
					if (alias && target) {
						aliases[alias + "/*"] = path.resolve(cwd, target) + "/*";
						aliases[alias] = path.resolve(cwd, target);
					}
				}
			}
		} catch {}
		break;
	}
	return aliases;
}
function createAppServerModule() {
	return `
// $app/server stub for CLI compatibility
export default {};
// jiti dirty hack: .unknown
`;
}
function createDataUriModule(module) {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`;
}
function createStaticEnvModule(env) {
	return `
  ${Object.keys(env).filter((k) => validIdentifier.test(k) && !reserved.has(k)).map((k) => `export const ${k} = ${JSON.stringify(env[k])};`).join("\n")}
  // jiti dirty hack: .unknown
  `;
}
function createDynamicEnvModule() {
	return `
  export const env = process.env;
  // jiti dirty hack: .unknown
  `;
}
function filterPrivateEnv(publicPrefix, privatePrefix) {
	return Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith(privatePrefix) && (publicPrefix === "" || !k.startsWith(publicPrefix))));
}
function filterPublicEnv(publicPrefix, privatePrefix) {
	return Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith(publicPrefix) && (privatePrefix === "" || !k.startsWith(privatePrefix))));
}
const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const reserved = new Set([
	"do",
	"if",
	"in",
	"for",
	"let",
	"new",
	"try",
	"var",
	"case",
	"else",
	"enum",
	"eval",
	"null",
	"this",
	"true",
	"void",
	"with",
	"await",
	"break",
	"catch",
	"class",
	"const",
	"false",
	"super",
	"throw",
	"while",
	"yield",
	"delete",
	"export",
	"import",
	"public",
	"return",
	"static",
	"switch",
	"typeof",
	"default",
	"extends",
	"finally",
	"package",
	"private",
	"continue",
	"debugger",
	"function",
	"arguments",
	"interface",
	"protected",
	"implements",
	"instanceof"
]);

//#endregion
//#region src/utils/get-tsconfig-info.ts
function stripJsonComments(jsonString) {
	return jsonString.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m).replace(/,(?=\s*[}\]])/g, "");
}
function getTsconfigInfo(cwd, flatPath) {
	let tsConfigPath;
	if (flatPath) tsConfigPath = flatPath;
	else tsConfigPath = cwd ? path.join(cwd, "tsconfig.json") : path.join("tsconfig.json");
	try {
		const text$1 = fs.readFileSync(tsConfigPath, "utf-8");
		return JSON.parse(stripJsonComments(text$1));
	} catch (error) {
		throw error;
	}
}

//#endregion
//#region src/utils/get-config.ts
let possiblePaths = [
	"auth.ts",
	"auth.tsx",
	"auth.js",
	"auth.jsx",
	"auth.server.js",
	"auth.server.ts",
	"auth/index.ts",
	"auth/index.tsx",
	"auth/index.js",
	"auth/index.jsx",
	"auth/index.server.js",
	"auth/index.server.ts"
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `server/auth/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `auth/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`)
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`)
];
function resolveReferencePath(configDir, refPath) {
	const resolvedPath = path.resolve(configDir, refPath);
	if (refPath.endsWith(".json")) return resolvedPath;
	if (fs.existsSync(resolvedPath)) try {
		if (fs.statSync(resolvedPath).isFile()) return resolvedPath;
	} catch {}
	return path.resolve(configDir, refPath, "tsconfig.json");
}
function getPathAliasesRecursive(tsconfigPath, visited = /* @__PURE__ */ new Set()) {
	if (visited.has(tsconfigPath)) return {};
	visited.add(tsconfigPath);
	if (!fs.existsSync(tsconfigPath)) {
		console.warn(`Referenced tsconfig not found: ${tsconfigPath}`);
		return {};
	}
	try {
		const tsConfig = getTsconfigInfo(void 0, tsconfigPath);
		const { paths = {}, baseUrl = "." } = tsConfig.compilerOptions || {};
		const result = {};
		const configDir = path.dirname(tsconfigPath);
		const obj = Object.entries(paths);
		for (const [alias, aliasPaths] of obj) for (const aliasedPath of aliasPaths) {
			const resolvedBaseUrl = path.resolve(configDir, baseUrl);
			const finalAlias = alias.slice(-1) === "*" ? alias.slice(0, -1) : alias;
			const finalAliasedPath = aliasedPath.slice(-1) === "*" ? aliasedPath.slice(0, -1) : aliasedPath;
			result[finalAlias || ""] = path.join(resolvedBaseUrl, finalAliasedPath);
		}
		if (tsConfig.references) for (const ref of tsConfig.references) {
			const refAliases = getPathAliasesRecursive(resolveReferencePath(configDir, ref.path), visited);
			for (const [alias, aliasPath] of Object.entries(refAliases)) if (!(alias in result)) result[alias] = aliasPath;
		}
		return result;
	} catch (error) {
		console.warn(`Error parsing tsconfig at ${tsconfigPath}: ${error}`);
		return {};
	}
}
function getPathAliases(cwd) {
	let tsConfigPath = path.join(cwd, "tsconfig.json");
	if (!fs.existsSync(tsConfigPath)) tsConfigPath = path.join(cwd, "jsconfig.json");
	if (!fs.existsSync(tsConfigPath)) return null;
	try {
		const result = getPathAliasesRecursive(tsConfigPath);
		addSvelteKitEnvModules(result);
		addCloudflareModules(result);
		return result;
	} catch (error) {
		console.error(error);
		throw new BetterAuthError("Error parsing tsconfig.json");
	}
}
/**
* .tsx files are not supported by Jiti.
*/
const jitiOptions = (cwd) => {
	const alias = getPathAliases(cwd) || {};
	return {
		transformOptions: { babel: { presets: [[babelPresetTypeScript, {
			isTSX: true,
			allExtensions: true
		}], [babelPresetReact, { runtime: "automatic" }]] } },
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx"
		],
		alias
	};
};
const isDefaultExport = (object) => {
	return typeof object === "object" && object !== null && !Array.isArray(object) && Object.keys(object).length > 0 && "options" in object;
};
async function getConfig({ cwd, configPath, shouldThrowOnError = false }) {
	try {
		let configFile = null;
		if (configPath) {
			let resolvedPath = path.join(cwd, configPath);
			if (existsSync(configPath)) resolvedPath = configPath;
			const { config } = await loadConfig({
				configFile: resolvedPath,
				dotenv: { fileName: [".env", ".env.local"] },
				jitiOptions: jitiOptions(cwd),
				cwd
			});
			if (!("auth" in config) && !isDefaultExport(config)) {
				if (shouldThrowOnError) throw new Error(`Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`);
				console.error(`[#better-auth]: Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`);
				process.exit(1);
			}
			configFile = "auth" in config ? config.auth?.options : config.options;
		}
		if (!configFile) for (const possiblePath of possiblePaths) try {
			const { config } = await loadConfig({
				configFile: possiblePath,
				dotenv: { fileName: [".env", ".env.local"] },
				jitiOptions: jitiOptions(cwd),
				cwd
			});
			if (Object.keys(config).length > 0) {
				configFile = config.auth?.options || config.default?.options || null;
				if (!configFile) {
					if (shouldThrowOnError) throw new Error("Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth.");
					console.error("[#better-auth]: Couldn't read your auth config.");
					console.log("");
					console.log("[#better-auth]: Make sure to default export your auth instance or to export as a variable named auth.");
					process.exit(1);
				}
				break;
			}
		} catch (e) {
			if (typeof e === "object" && e && "message" in e && typeof e.message === "string" && e.message.includes("This module cannot be imported from a Client Component module")) {
				if (shouldThrowOnError) throw new Error(`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`);
				console.error(`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`);
				process.exit(1);
			}
			if (shouldThrowOnError) throw e;
			console.error("[#better-auth]: Couldn't read your auth config.", e);
			process.exit(1);
		}
		return configFile;
	} catch (e) {
		if (typeof e === "object" && e && "message" in e && typeof e.message === "string" && e.message.includes("This module cannot be imported from a Client Component module")) {
			if (shouldThrowOnError) throw new Error(`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`);
			console.error(`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`);
			process.exit(1);
		}
		if (shouldThrowOnError) throw e;
		console.error("Couldn't read your auth config.", e);
		process.exit(1);
	}
}

//#endregion
//#region src/commands/generate.ts
async function generateAction(opts) {
	const options = z.object({
		cwd: z.string(),
		config: z.string().optional(),
		output: z.string().optional(),
		y: z.boolean().optional(),
		yes: z.boolean().optional()
	}).parse(opts);
	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}
	const config = await getConfig({
		cwd,
		configPath: options.config
	});
	if (!config) {
		console.error("No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.");
		return;
	}
	const adapter = await getAdapter(config).catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
	const spinner$1 = yoctoSpinner({ text: "preparing schema..." }).start();
	const schema = await generateSchema({
		adapter,
		file: options.output,
		options: config
	});
	spinner$1.stop();
	if (!schema.code) {
		console.log("Your schema is already up to date.");
		try {
			await (await createTelemetry(config)).publish({
				type: "cli_generate",
				payload: {
					outcome: "no_changes",
					config: getTelemetryAuthConfig(config, {
						adapter: adapter.id,
						database: typeof config.database === "function" ? "adapter" : "kysely"
					})
				}
			});
		} catch {}
		process.exit(0);
	}
	if (schema.overwrite) {
		let confirm$2 = options.y || options.yes;
		if (!confirm$2) confirm$2 = (await prompts({
			type: "confirm",
			name: "confirm",
			message: `The file ${schema.fileName} already exists. Do you want to ${chalk.yellow(`${schema.overwrite ? "overwrite" : "append"}`)} the schema to the file?`
		})).confirm;
		if (confirm$2) {
			if (!existsSync(path.join(cwd, schema.fileName))) await fs$1.mkdir(path.dirname(path.join(cwd, schema.fileName)), { recursive: true });
			if (schema.overwrite) await fs$1.writeFile(path.join(cwd, schema.fileName), schema.code);
			else await fs$1.appendFile(path.join(cwd, schema.fileName), schema.code);
			console.log(`🚀 Schema was ${schema.overwrite ? "overwritten" : "appended"} successfully!`);
			try {
				await (await createTelemetry(config)).publish({
					type: "cli_generate",
					payload: {
						outcome: schema.overwrite ? "overwritten" : "appended",
						config: getTelemetryAuthConfig(config)
					}
				});
			} catch {}
			process.exit(0);
		} else {
			console.error("Schema generation aborted.");
			try {
				await (await createTelemetry(config)).publish({
					type: "cli_generate",
					payload: {
						outcome: "aborted",
						config: getTelemetryAuthConfig(config)
					}
				});
			} catch {}
			process.exit(1);
		}
	}
	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}
	let confirm$1 = options.yes;
	if (!confirm$1) confirm$1 = (await prompts({
		type: "confirm",
		name: "confirm",
		message: `Do you want to generate the schema to ${chalk.yellow(schema.fileName)}?`
	})).confirm;
	if (!confirm$1) {
		console.error("Schema generation aborted.");
		try {
			await (await createTelemetry(config)).publish({
				type: "cli_generate",
				payload: {
					outcome: "aborted",
					config: getTelemetryAuthConfig(config)
				}
			});
		} catch {}
		process.exit(1);
	}
	if (!options.output) {
		if (!existsSync(path.dirname(path.join(cwd, schema.fileName)))) await fs$1.mkdir(path.dirname(path.join(cwd, schema.fileName)), { recursive: true });
	}
	await fs$1.writeFile(options.output || path.join(cwd, schema.fileName), schema.code);
	console.log(`🚀 Schema was generated successfully!`);
	try {
		await (await createTelemetry(config)).publish({
			type: "cli_generate",
			payload: {
				outcome: "generated",
				config: getTelemetryAuthConfig(config)
			}
		});
	} catch {}
	process.exit(0);
}
const generate = new Command("generate").option("-c, --cwd <cwd>", "the working directory. defaults to the current directory.", process.cwd()).option("--config <config>", "the path to the configuration file. defaults to the first configuration file found.").option("--output <output>", "the file to output to the generated schema").option("-y, --yes", "automatically answer yes to all prompts", false).option("--y", "(deprecated) same as --yes", false).action(generateAction);

//#endregion
//#region src/commands/info.ts
function getSystemInfo() {
	const platform = os.platform();
	const arch = os.arch();
	const version = os.version();
	const release = os.release();
	const cpus = os.cpus();
	const memory = os.totalmem();
	const freeMemory = os.freemem();
	return {
		platform,
		arch,
		version,
		release,
		cpuCount: cpus.length,
		cpuModel: cpus[0]?.model || "Unknown",
		totalMemory: `${(memory / 1024 / 1024 / 1024).toFixed(2)} GB`,
		freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`
	};
}
function getNodeInfo() {
	return {
		version: process.version,
		env: process.env.NODE_ENV || "development"
	};
}
function getPackageManager$1() {
	const userAgent = process.env.npm_config_user_agent || "";
	if (userAgent.includes("yarn")) return {
		name: "yarn",
		version: getVersion("yarn")
	};
	if (userAgent.includes("pnpm")) return {
		name: "pnpm",
		version: getVersion("pnpm")
	};
	if (userAgent.includes("bun")) return {
		name: "bun",
		version: getVersion("bun")
	};
	return {
		name: "npm",
		version: getVersion("npm")
	};
}
function getVersion(command) {
	try {
		return execSync(`${command} --version`, { encoding: "utf8" }).trim();
	} catch {
		return "Not installed";
	}
}
function getFrameworkInfo(projectRoot) {
	const packageJsonPath = path.join(projectRoot, "package.json");
	if (!existsSync(packageJsonPath)) return null;
	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		};
		const frameworks = {
			next: deps["next"],
			react: deps["react"],
			vue: deps["vue"],
			nuxt: deps["nuxt"],
			svelte: deps["svelte"],
			"@sveltejs/kit": deps["@sveltejs/kit"],
			express: deps["express"],
			fastify: deps["fastify"],
			hono: deps["hono"],
			remix: deps["@remix-run/react"],
			astro: deps["astro"],
			solid: deps["solid-js"],
			qwik: deps["@builder.io/qwik"]
		};
		const installedFrameworks = Object.entries(frameworks).filter(([_, version]) => version).map(([name, version]) => ({
			name,
			version
		}));
		return installedFrameworks.length > 0 ? installedFrameworks : null;
	} catch {
		return null;
	}
}
function getDatabaseInfo(projectRoot) {
	const packageJsonPath = path.join(projectRoot, "package.json");
	if (!existsSync(packageJsonPath)) return null;
	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		};
		const databases = {
			"better-sqlite3": deps["better-sqlite3"],
			"@libsql/client": deps["@libsql/client"],
			"@libsql/kysely-libsql": deps["@libsql/kysely-libsql"],
			mysql2: deps["mysql2"],
			pg: deps["pg"],
			postgres: deps["postgres"],
			"@prisma/client": deps["@prisma/client"],
			drizzle: deps["drizzle-orm"],
			kysely: deps["kysely"],
			mongodb: deps["mongodb"],
			"@neondatabase/serverless": deps["@neondatabase/serverless"],
			"@vercel/postgres": deps["@vercel/postgres"],
			"@planetscale/database": deps["@planetscale/database"]
		};
		const installedDatabases = Object.entries(databases).filter(([_, version]) => version).map(([name, version]) => ({
			name,
			version
		}));
		return installedDatabases.length > 0 ? installedDatabases : null;
	} catch {
		return null;
	}
}
function sanitizeBetterAuthConfig(config) {
	if (!config) return null;
	const sanitized = JSON.parse(JSON.stringify(config));
	const sensitiveKeys = [
		"secret",
		"clientSecret",
		"clientId",
		"authToken",
		"apiKey",
		"apiSecret",
		"privateKey",
		"publicKey",
		"password",
		"token",
		"webhook",
		"connectionString",
		"databaseUrl",
		"databaseURL",
		"TURSO_AUTH_TOKEN",
		"TURSO_DATABASE_URL",
		"MYSQL_DATABASE_URL",
		"DATABASE_URL",
		"POSTGRES_URL",
		"MONGODB_URI",
		"stripeKey",
		"stripeWebhookSecret"
	];
	const allowedKeys = [
		"baseURL",
		"callbackURL",
		"redirectURL",
		"trustedOrigins",
		"appName"
	];
	function redactSensitive(obj, parentKey) {
		if (typeof obj !== "object" || obj === null) {
			if (parentKey && typeof obj === "string" && obj.length > 0) {
				if (allowedKeys.some((allowed) => parentKey.toLowerCase() === allowed.toLowerCase())) return obj;
				const lowerKey = parentKey.toLowerCase();
				if (sensitiveKeys.some((key) => {
					const lowerSensitiveKey = key.toLowerCase();
					return lowerKey === lowerSensitiveKey || lowerKey.endsWith(lowerSensitiveKey);
				})) return "[REDACTED]";
			}
			return obj;
		}
		if (Array.isArray(obj)) return obj.map((item) => redactSensitive(item, parentKey));
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			if (allowedKeys.some((allowed) => key.toLowerCase() === allowed.toLowerCase())) {
				result[key] = value;
				continue;
			}
			const lowerKey = key.toLowerCase();
			if (sensitiveKeys.some((sensitiveKey) => {
				const lowerSensitiveKey = sensitiveKey.toLowerCase();
				return lowerKey === lowerSensitiveKey || lowerKey.endsWith(lowerSensitiveKey);
			})) if (typeof value === "string" && value.length > 0) result[key] = "[REDACTED]";
			else if (typeof value === "object" && value !== null) result[key] = redactSensitive(value, key);
			else result[key] = value;
			else result[key] = redactSensitive(value, key);
		}
		return result;
	}
	if (sanitized.database) {
		if (typeof sanitized.database === "string") sanitized.database = "[REDACTED]";
		else if (sanitized.database.url) sanitized.database.url = "[REDACTED]";
		if (sanitized.database.authToken) sanitized.database.authToken = "[REDACTED]";
	}
	if (sanitized.socialProviders) {
		for (const provider in sanitized.socialProviders) if (sanitized.socialProviders[provider]) sanitized.socialProviders[provider] = redactSensitive(sanitized.socialProviders[provider], provider);
	}
	if (sanitized.emailAndPassword?.sendResetPassword) sanitized.emailAndPassword.sendResetPassword = "[Function]";
	if (sanitized.emailVerification?.sendVerificationEmail) sanitized.emailVerification.sendVerificationEmail = "[Function]";
	if (sanitized.plugins && Array.isArray(sanitized.plugins)) sanitized.plugins = sanitized.plugins.map((plugin) => {
		if (typeof plugin === "function") return "[Plugin Function]";
		if (plugin && typeof plugin === "object") return {
			name: plugin.id || plugin.name || "unknown",
			config: redactSensitive(plugin.config || plugin)
		};
		return plugin;
	});
	return redactSensitive(sanitized);
}
async function getBetterAuthInfo(projectRoot, configPath, suppressLogs = false) {
	try {
		const originalLog = console.log;
		const originalWarn = console.warn;
		const originalError = console.error;
		if (suppressLogs) {
			console.log = () => {};
			console.warn = () => {};
			console.error = () => {};
		}
		try {
			const config = await getConfig({
				cwd: projectRoot,
				configPath,
				shouldThrowOnError: true
			});
			const packageInfo = await getPackageInfo();
			return {
				version: packageInfo.dependencies?.["better-auth"] || packageInfo.devDependencies?.["better-auth"] || packageInfo.peerDependencies?.["better-auth"] || packageInfo.optionalDependencies?.["better-auth"] || "Unknown",
				config: sanitizeBetterAuthConfig(config)
			};
		} finally {
			if (suppressLogs) {
				console.log = originalLog;
				console.warn = originalWarn;
				console.error = originalError;
			}
		}
	} catch (error) {
		return {
			version: "Unknown",
			config: null,
			error: error instanceof Error ? error.message : "Failed to load Better Auth config"
		};
	}
}
function formatOutput(data, indent = 0) {
	const spaces = " ".repeat(indent);
	if (data === null || data === void 0) return `${spaces}${chalk.gray("N/A")}`;
	if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return `${spaces}${data}`;
	if (Array.isArray(data)) {
		if (data.length === 0) return `${spaces}${chalk.gray("[]")}`;
		return data.map((item) => formatOutput(item, indent)).join("\n");
	}
	if (typeof data === "object") {
		const entries = Object.entries(data);
		if (entries.length === 0) return `${spaces}${chalk.gray("{}")}`;
		return entries.map(([key, value]) => {
			if (typeof value === "object" && value !== null && !Array.isArray(value)) return `${spaces}${chalk.cyan(key)}:\n${formatOutput(value, indent + 2)}`;
			return `${spaces}${chalk.cyan(key)}: ${formatOutput(value, 0)}`;
		}).join("\n");
	}
	return `${spaces}${JSON.stringify(data)}`;
}
const info = new Command("info").description("Display system and Better Auth configuration information").option("--cwd <cwd>", "The working directory", process.cwd()).option("--config <config>", "Path to the Better Auth configuration file").option("-j, --json", "Output as JSON").option("-c, --copy", "Copy output to clipboard (requires pbcopy/xclip)").action(async (options) => {
	const projectRoot = path.resolve(options.cwd || process.cwd());
	const systemInfo = getSystemInfo();
	const nodeInfo = getNodeInfo();
	const packageManager = getPackageManager$1();
	const frameworks = getFrameworkInfo(projectRoot);
	const databases = getDatabaseInfo(projectRoot);
	const betterAuthInfo = await getBetterAuthInfo(projectRoot, options.config, options.json);
	const fullInfo = {
		system: systemInfo,
		node: nodeInfo,
		packageManager,
		frameworks,
		databases,
		betterAuth: betterAuthInfo
	};
	if (options.json) {
		const jsonOutput = JSON.stringify(fullInfo, null, 2);
		console.log(jsonOutput);
		if (options.copy) try {
			const platform = os.platform();
			if (platform === "darwin") {
				execSync("pbcopy", { input: jsonOutput });
				console.log(chalk.green("\n✓ Copied to clipboard"));
			} else if (platform === "linux") {
				execSync("xclip -selection clipboard", { input: jsonOutput });
				console.log(chalk.green("\n✓ Copied to clipboard"));
			} else if (platform === "win32") {
				execSync("clip", { input: jsonOutput });
				console.log(chalk.green("\n✓ Copied to clipboard"));
			}
		} catch {
			console.log(chalk.yellow("\n⚠ Could not copy to clipboard"));
		}
		return;
	}
	console.log(chalk.bold("\n📊 Better Auth System Information\n"));
	console.log(chalk.gray("=".repeat(50)));
	console.log(chalk.bold.white("\n🖥️  System Information:"));
	console.log(formatOutput(systemInfo, 2));
	console.log(chalk.bold.white("\n📦 Node.js:"));
	console.log(formatOutput(nodeInfo, 2));
	console.log(chalk.bold.white("\n📦 Package Manager:"));
	console.log(formatOutput(packageManager, 2));
	if (frameworks) {
		console.log(chalk.bold.white("\n🚀 Frameworks:"));
		console.log(formatOutput(frameworks, 2));
	}
	if (databases) {
		console.log(chalk.bold.white("\n💾 Database Clients:"));
		console.log(formatOutput(databases, 2));
	}
	console.log(chalk.bold.white("\n🔐 Better Auth:"));
	if (betterAuthInfo.error) console.log(`  ${chalk.red("Error:")} ${betterAuthInfo.error}`);
	else {
		console.log(`  ${chalk.cyan("Version")}: ${betterAuthInfo.version}`);
		if (betterAuthInfo.config) {
			console.log(`  ${chalk.cyan("Configuration")}:`);
			console.log(formatOutput(betterAuthInfo.config, 4));
		}
	}
	console.log(chalk.gray("\n" + "=".repeat(50)));
	console.log(chalk.gray("\n💡 Tip: Use --json flag for JSON output"));
	console.log(chalk.gray("💡 Use --copy flag to copy output to clipboard"));
	console.log(chalk.gray("💡 When reporting issues, include this information\n"));
	if (options.copy) {
		const textOutput = `
Better Auth System Information
==============================

System Information:
${JSON.stringify(systemInfo, null, 2)}

Node.js:
${JSON.stringify(nodeInfo, null, 2)}

Package Manager:
${JSON.stringify(packageManager, null, 2)}

Frameworks:
${JSON.stringify(frameworks, null, 2)}

Database Clients:
${JSON.stringify(databases, null, 2)}

Better Auth:
${JSON.stringify(betterAuthInfo, null, 2)}
`;
		try {
			const platform = os.platform();
			if (platform === "darwin") {
				execSync("pbcopy", { input: textOutput });
				console.log(chalk.green("✓ Copied to clipboard"));
			} else if (platform === "linux") {
				execSync("xclip -selection clipboard", { input: textOutput });
				console.log(chalk.green("✓ Copied to clipboard"));
			} else if (platform === "win32") {
				execSync("clip", { input: textOutput });
				console.log(chalk.green("✓ Copied to clipboard"));
			}
		} catch {
			console.log(chalk.yellow("⚠ Could not copy to clipboard"));
		}
	}
});

//#endregion
//#region src/generators/auth-config.ts
async function generateAuthConfig({ format: format$1, current_user_config, spinner: spinner$1, plugins, database }) {
	const common_indexes = {
		START_OF_PLUGINS: { START_OF_PLUGINS: {
			type: "regex",
			regex: /betterAuth\([\w\W]*plugins:[\W]*\[()/m,
			getIndex: ({ matchIndex, match }) => {
				return matchIndex + match[0].length;
			}
		} }.START_OF_PLUGINS,
		END_OF_PLUGINS: {
			type: "manual",
			getIndex: ({ content, additionalFields }) => {
				return findClosingBracket(content, additionalFields.start_of_plugins, "[", "]");
			}
		},
		START_OF_BETTERAUTH: {
			type: "regex",
			regex: /betterAuth\({()/m,
			getIndex: ({ matchIndex }) => {
				return matchIndex + 12;
			}
		}
	};
	const config_generation = {
		add_plugin: async (opts) => {
			const start_of_plugins = getGroupInfo(opts.config, common_indexes.START_OF_PLUGINS, {});
			if (!start_of_plugins) throw new Error("Couldn't find start of your plugins array in your auth config file.");
			const end_of_plugins = getGroupInfo(opts.config, common_indexes.END_OF_PLUGINS, { start_of_plugins: start_of_plugins.index });
			if (!end_of_plugins) throw new Error("Couldn't find end of your plugins array in your auth config file.");
			let new_content;
			if (opts.direction_in_plugins_array === "prepend") new_content = insertContent({
				line: start_of_plugins.line,
				character: start_of_plugins.character,
				content: opts.config,
				insert_content: `${opts.pluginFunctionName}(${opts.pluginContents}),`
			});
			else {
				const pluginArrayContent = opts.config.slice(start_of_plugins.index, end_of_plugins.index).trim();
				const isPluginArrayEmpty = pluginArrayContent === "";
				const isPluginArrayEndsWithComma = pluginArrayContent.endsWith(",");
				const needsComma = !isPluginArrayEmpty && !isPluginArrayEndsWithComma;
				new_content = insertContent({
					line: end_of_plugins.line,
					character: end_of_plugins.character,
					content: opts.config,
					insert_content: `${needsComma ? "," : ""}${opts.pluginFunctionName}(${opts.pluginContents})`
				});
			}
			try {
				new_content = await format$1(new_content);
			} catch (error) {
				console.error(error);
				throw new Error(`Failed to generate new auth config during plugin addition phase.`);
			}
			return {
				code: new_content,
				dependencies: [],
				envs: []
			};
		},
		add_import: async (opts) => {
			let importString = "";
			for (const import_ of opts.imports) if (Array.isArray(import_.variables)) importString += `import { ${import_.variables.map((x) => `${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`).join(", ")} } from "${import_.path}";\n`;
			else importString += `import ${import_.variables.asType ? "type " : ""}${import_.variables.name}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${import_.path}";\n`;
			try {
				return {
					code: await format$1(importString + opts.config),
					dependencies: [],
					envs: []
				};
			} catch (error) {
				console.error(error);
				throw new Error(`Failed to generate new auth config during import addition phase.`);
			}
		},
		add_database: async (opts) => {
			const required_envs = [];
			const required_deps = [];
			let database_code_str = "";
			async function add_db({ db_code, dependencies, envs, imports, code_before_betterAuth }) {
				if (code_before_betterAuth) {
					const start_of_betterauth$1 = getGroupInfo(opts.config, common_indexes.START_OF_BETTERAUTH, {});
					if (!start_of_betterauth$1) throw new Error("Couldn't find start of betterAuth() function.");
					opts.config = insertContent({
						line: start_of_betterauth$1.line - 1,
						character: 0,
						content: opts.config,
						insert_content: `\n${code_before_betterAuth}\n`
					});
				}
				const code_gen = await config_generation.add_import({
					config: opts.config,
					imports
				});
				opts.config = code_gen.code;
				database_code_str = db_code;
				required_envs.push(...envs, ...code_gen.envs);
				required_deps.push(...dependencies, ...code_gen.dependencies);
			}
			if (opts.database === "sqlite") await add_db({
				db_code: `new Database(process.env.DATABASE_URL || "database.sqlite")`,
				dependencies: ["better-sqlite3"],
				envs: ["DATABASE_URL"],
				imports: [{
					path: "better-sqlite3",
					variables: {
						asType: false,
						name: "Database"
					}
				}]
			});
			else if (opts.database === "postgres") await add_db({
				db_code: `new Pool({\nconnectionString: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/database"\n})`,
				dependencies: ["pg"],
				envs: ["DATABASE_URL"],
				imports: [{
					path: "pg",
					variables: [{
						asType: false,
						name: "Pool"
					}]
				}]
			});
			else if (opts.database === "mysql") await add_db({
				db_code: `createPool(process.env.DATABASE_URL!)`,
				dependencies: ["mysql2"],
				envs: ["DATABASE_URL"],
				imports: [{
					path: "mysql2/promise",
					variables: [{
						asType: false,
						name: "createPool"
					}]
				}]
			});
			else if (opts.database === "mssql") await add_db({
				code_before_betterAuth: `new MssqlDialect({
						tarn: {
							...Tarn,
							options: {
							min: 0,
							max: 10,
							},
						},
						tedious: {
							...Tedious,
							connectionFactory: () => new Tedious.Connection({
							authentication: {
								options: {
								password: 'password',
								userName: 'username',
								},
								type: 'default',
							},
							options: {
								database: 'some_db',
								port: 1433,
								trustServerCertificate: true,
							},
							server: 'localhost',
							}),
						},
					})`,
				db_code: `dialect`,
				dependencies: [
					"tedious",
					"tarn",
					"kysely"
				],
				envs: ["DATABASE_URL"],
				imports: [
					{
						path: "tedious",
						variables: {
							name: "*",
							as: "Tedious"
						}
					},
					{
						path: "tarn",
						variables: {
							name: "*",
							as: "Tarn"
						}
					},
					{
						path: "kysely",
						variables: [{ name: "MssqlDialect" }]
					}
				]
			});
			else if (opts.database === "drizzle:mysql" || opts.database === "drizzle:sqlite" || opts.database === "drizzle:pg") await add_db({
				db_code: `drizzleAdapter(db, {\nprovider: "${opts.database.replace("drizzle:", "")}",\n})`,
				dependencies: [""],
				envs: [],
				imports: [{
					path: "better-auth/adapters/drizzle",
					variables: [{ name: "drizzleAdapter" }]
				}, {
					path: "./database.ts",
					variables: [{ name: "db" }]
				}]
			});
			else if (opts.database === "prisma:mysql" || opts.database === "prisma:sqlite" || opts.database === "prisma:postgresql") await add_db({
				db_code: `prismaAdapter(client, {\nprovider: "${opts.database.replace("prisma:", "")}",\n})`,
				dependencies: [`@prisma/client`],
				envs: [],
				code_before_betterAuth: "const client = new PrismaClient();",
				imports: [{
					path: "better-auth/adapters/prisma",
					variables: [{ name: "prismaAdapter" }]
				}, {
					path: "@prisma/client",
					variables: [{ name: "PrismaClient" }]
				}]
			});
			else if (opts.database === "mongodb") await add_db({
				db_code: `mongodbAdapter(db)`,
				dependencies: ["mongodb"],
				envs: [`DATABASE_URL`],
				code_before_betterAuth: [`const client = new MongoClient(process.env.DATABASE_URL || "mongodb://localhost:27017/database");`, `const db = client.db();`].join("\n"),
				imports: [{
					path: "better-auth/adapters/mongodb",
					variables: [{ name: "mongodbAdapter" }]
				}, {
					path: "mongodb",
					variables: [{ name: "MongoClient" }]
				}]
			});
			const start_of_betterauth = getGroupInfo(opts.config, common_indexes.START_OF_BETTERAUTH, {});
			if (!start_of_betterauth) throw new Error("Couldn't find start of betterAuth() function.");
			let new_content;
			new_content = insertContent({
				line: start_of_betterauth.line,
				character: start_of_betterauth.character,
				content: opts.config,
				insert_content: `database: ${database_code_str},`
			});
			try {
				new_content = await format$1(new_content);
				return {
					code: new_content,
					dependencies: required_deps,
					envs: required_envs
				};
			} catch (error) {
				console.error(error);
				throw new Error(`Failed to generate new auth config during database addition phase.`);
			}
		}
	};
	let new_user_config = await format$1(current_user_config);
	const total_dependencies = [];
	const total_envs = [];
	if (plugins.length !== 0) {
		const imports = [];
		for await (const plugin of plugins) {
			const existingIndex = imports.findIndex((x) => x.path === plugin.path);
			if (existingIndex !== -1) imports[existingIndex].variables.push({
				name: plugin.name,
				asType: false
			});
			else imports.push({
				path: plugin.path,
				variables: [{
					name: plugin.name,
					asType: false
				}]
			});
		}
		if (imports.length !== 0) {
			const { code, envs, dependencies } = await config_generation.add_import({
				config: new_user_config,
				imports
			});
			total_dependencies.push(...dependencies);
			total_envs.push(...envs);
			new_user_config = code;
		}
	}
	for await (const plugin of plugins) try {
		let pluginContents = "";
		if (plugin.id === "magic-link") pluginContents = `{\nsendMagicLink({ email, token, url }, request) {\n// Send email with magic link\n},\n}`;
		else if (plugin.id === "email-otp") pluginContents = `{\nasync sendVerificationOTP({ email, otp, type }, request) {\n// Send email with OTP\n},\n}`;
		else if (plugin.id === "generic-oauth") pluginContents = `{\nconfig: [],\n}`;
		else if (plugin.id === "oidc") pluginContents = `{\nloginPage: "/sign-in",\n}`;
		const { code, dependencies, envs } = await config_generation.add_plugin({
			config: new_user_config,
			direction_in_plugins_array: plugin.id === "next-cookies" ? "append" : "prepend",
			pluginFunctionName: plugin.name,
			pluginContents
		});
		new_user_config = code;
		total_envs.push(...envs);
		total_dependencies.push(...dependencies);
	} catch (error) {
		spinner$1.stop(`Something went wrong while generating/updating your new auth config file.`, 1);
		console.error(error.message);
		process.exit(1);
	}
	if (database) try {
		const { code, dependencies, envs } = await config_generation.add_database({
			config: new_user_config,
			database
		});
		new_user_config = code;
		total_dependencies.push(...dependencies);
		total_envs.push(...envs);
	} catch (error) {
		spinner$1.stop(`Something went wrong while generating/updating your new auth config file.`, 1);
		console.error(error.message);
		process.exit(1);
	}
	return {
		generatedCode: new_user_config,
		dependencies: total_dependencies,
		envs: total_envs
	};
}
function findClosingBracket(content, startIndex, openingBracket, closingBracket) {
	let stack = 0;
	let inString = false;
	let quoteChar = null;
	for (let i = startIndex; i < content.length; i++) {
		const char = content[i];
		if (char === "\"" || char === "'" || char === "`") {
			if (!inString) {
				inString = true;
				quoteChar = char;
			} else if (char === quoteChar) {
				inString = false;
				quoteChar = null;
			}
			continue;
		}
		if (!inString) {
			if (char === openingBracket) stack++;
			else if (char === closingBracket) {
				if (stack === 0) return i;
				stack--;
			}
		}
	}
	return null;
}
/**
* Helper function to insert content at a specific line and character position in a string.
*/
function insertContent(params) {
	const { line, character, content, insert_content } = params;
	const lines = content.split("\n");
	if (line < 1 || line > lines.length) throw new Error("Invalid line number");
	const targetLineIndex = line - 1;
	if (character < 0 || character > lines[targetLineIndex].length) throw new Error("Invalid character index");
	const targetLine = lines[targetLineIndex];
	lines[targetLineIndex] = targetLine.slice(0, character) + insert_content + targetLine.slice(character);
	return lines.join("\n");
}
/**
* Helper function to get the line and character position of a specific group in a string using a CommonIndexConfig.
*/
function getGroupInfo(content, commonIndexConfig, additionalFields) {
	if (commonIndexConfig.type === "regex") {
		const { regex, getIndex } = commonIndexConfig;
		const match = regex.exec(content);
		if (match) {
			const matchIndex = match.index;
			const groupIndex = getIndex({
				matchIndex,
				match,
				additionalFields
			});
			if (groupIndex === null) return null;
			const position = getPosition(content, groupIndex);
			return {
				line: position.line,
				character: position.character,
				index: groupIndex
			};
		}
		return null;
	} else {
		const { getIndex } = commonIndexConfig;
		const index = getIndex({
			content,
			additionalFields
		});
		if (index === null) return null;
		const { line, character } = getPosition(content, index);
		return {
			line,
			character,
			index
		};
	}
}
/**
* Helper function to calculate line and character position based on an index
*/
const getPosition = (str, index) => {
	const lines = str.slice(0, index).split("\n");
	return {
		line: lines.length,
		character: lines[lines.length - 1].length
	};
};

//#endregion
//#region src/utils/check-package-managers.ts
function checkCommand(command) {
	return new Promise((resolve) => {
		exec(`${command} --version`, (error) => {
			if (error) resolve(false);
			else resolve(true);
		});
	});
}
async function checkPackageManagers() {
	return {
		hasPnpm: await checkCommand("pnpm"),
		hasBun: await checkCommand("bun")
	};
}

//#endregion
//#region src/utils/format-ms.ts
/**
* Only supports up to seconds.
*/
function formatMilliseconds(ms) {
	if (ms < 0) throw new Error("Milliseconds cannot be negative");
	if (ms < 1e3) return `${ms}ms`;
	return `${Math.floor(ms / 1e3)}s ${ms % 1e3}ms`;
}

//#endregion
//#region src/utils/install-dependencies.ts
function installDependencies({ dependencies, packageManager, cwd }) {
	let installCommand;
	switch (packageManager) {
		case "npm":
			installCommand = "npm install --force";
			break;
		case "pnpm":
			installCommand = "pnpm install";
			break;
		case "bun":
			installCommand = "bun install";
			break;
		case "yarn":
			installCommand = "yarn install";
			break;
		default: throw new Error("Invalid package manager");
	}
	const command = `${installCommand} ${dependencies.join(" ")}`;
	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve(true);
		});
	});
}

//#endregion
//#region src/commands/secret.ts
const generateSecret = new Command("secret").action(() => {
	const secret = generateSecretHash();
	console.log(`\nAdd the following to your .env file: 
${chalk.gray("# Auth Secret") + chalk.green(`\nBETTER_AUTH_SECRET=${secret}`)}`);
});
const generateSecretHash = () => {
	return Crypto.randomBytes(32).toString("hex");
};

//#endregion
//#region src/commands/init.ts
/**
* Should only use any database that is core DBs, and supports the Better Auth CLI generate functionality.
*/
const supportedDatabases = [
	"sqlite",
	"mysql",
	"mssql",
	"postgres",
	"drizzle:pg",
	"drizzle:mysql",
	"drizzle:sqlite",
	"prisma:postgresql",
	"prisma:mysql",
	"prisma:sqlite",
	"mongodb"
];
const supportedPlugins = [
	{
		id: "two-factor",
		name: "twoFactor",
		path: `better-auth/plugins`,
		clientName: "twoFactorClient",
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "username",
		name: "username",
		clientName: "usernameClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "anonymous",
		name: "anonymous",
		clientName: "anonymousClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "phone-number",
		name: "phoneNumber",
		clientName: "phoneNumberClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "magic-link",
		name: "magicLink",
		clientName: "magicLinkClient",
		clientPath: "better-auth/client/plugins",
		path: `better-auth/plugins`
	},
	{
		id: "email-otp",
		name: "emailOTP",
		clientName: "emailOTPClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "passkey",
		name: "passkey",
		clientName: "passkeyClient",
		path: `@better-auth/passkey`,
		clientPath: "@better-auth/passkey/client"
	},
	{
		id: "generic-oauth",
		name: "genericOAuth",
		clientName: "genericOAuthClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "one-tap",
		name: "oneTap",
		clientName: "oneTapClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "api-key",
		name: "apiKey",
		clientName: "apiKeyClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "admin",
		name: "admin",
		clientName: "adminClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "organization",
		name: "organization",
		clientName: "organizationClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "oidc",
		name: "oidcProvider",
		clientName: "oidcClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "sso",
		name: "sso",
		clientName: "ssoClient",
		path: `@better-auth/sso`,
		clientPath: "@better-auth/sso/client"
	},
	{
		id: "bearer",
		name: "bearer",
		clientName: void 0,
		path: `better-auth/plugins`,
		clientPath: void 0
	},
	{
		id: "multi-session",
		name: "multiSession",
		clientName: "multiSessionClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins"
	},
	{
		id: "oauth-provider",
		name: "oauthProvider",
		clientName: "oauthProviderClient",
		path: `@better-auth/oauth-provider`,
		clientPath: "@better-auth/oauth-provider/client"
	},
	{
		id: "oauth-provider-resource-client",
		name: "oauthProviderResource",
		clientName: "oauthProviderResourceClient",
		path: `@better-auth/oauth-provider`,
		clientPath: "@better-auth/oauth-provider/client"
	},
	{
		id: "oauth-proxy",
		name: "oAuthProxy",
		clientName: void 0,
		path: `better-auth/plugins`,
		clientPath: void 0
	},
	{
		id: "open-api",
		name: "openAPI",
		clientName: void 0,
		path: `better-auth/plugins`,
		clientPath: void 0
	},
	{
		id: "jwt",
		name: "jwt",
		clientName: void 0,
		clientPath: void 0,
		path: `better-auth/plugins`
	},
	{
		id: "next-cookies",
		name: "nextCookies",
		clientPath: void 0,
		clientName: void 0,
		path: `better-auth/next-js`
	}
];
const defaultFormatOptions = {
	trailingComma: "all",
	useTabs: false,
	tabWidth: 4
};
const getDefaultAuthConfig = async ({ appName }) => await format([
	"import { betterAuth } from 'better-auth';",
	"",
	"export const auth = betterAuth({",
	appName ? `appName: "${appName}",` : "",
	"plugins: [],",
	"});"
].join("\n"), {
	filepath: "auth.ts",
	...defaultFormatOptions
});
const getDefaultAuthClientConfig = async ({ auth_config_path, framework, clientPlugins }) => {
	function groupImportVariables() {
		const result = [{
			path: "better-auth/client/plugins",
			variables: [{ name: "inferAdditionalFields" }]
		}];
		for (const plugin of clientPlugins) for (const import_ of plugin.imports) if (Array.isArray(import_.variables)) for (const variable of import_.variables) {
			const existingIndex = result.findIndex((x) => x.path === import_.path);
			if (existingIndex !== -1) {
				const vars = result[existingIndex].variables;
				if (Array.isArray(vars)) vars.push(variable);
				else result[existingIndex].variables = [vars, variable];
			} else result.push({
				path: import_.path,
				variables: [variable]
			});
		}
		else {
			const existingIndex = result.findIndex((x) => x.path === import_.path);
			if (existingIndex !== -1) {
				const vars = result[existingIndex].variables;
				if (Array.isArray(vars)) vars.push(import_.variables);
				else result[existingIndex].variables = [vars, import_.variables];
			} else result.push({
				path: import_.path,
				variables: [import_.variables]
			});
		}
		return result;
	}
	const imports = groupImportVariables();
	let importString = "";
	for (const import_ of imports) if (Array.isArray(import_.variables)) importString += `import { ${import_.variables.map((x) => `${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`).join(", ")} } from "${import_.path}";\n`;
	else importString += `import ${import_.variables.asType ? "type " : ""}${import_.variables.name}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${import_.path}";\n`;
	return await format([
		`import { createAuthClient } from "better-auth/${framework === "nextjs" ? "react" : framework === "vanilla" ? "client" : framework}";`,
		`import type { auth } from "${auth_config_path}";`,
		importString,
		``,
		`export const authClient = createAuthClient({`,
		`baseURL: "http://localhost:3000",`,
		`plugins: [inferAdditionalFields<typeof auth>(),${clientPlugins.map((x) => `${x.name}(${x.contents})`).join(", ")}],`,
		`});`
	].join("\n"), {
		filepath: "auth-client.ts",
		...defaultFormatOptions
	});
};
const optionsSchema = z.object({
	cwd: z.string(),
	config: z.string().optional(),
	database: z.enum(supportedDatabases).optional(),
	"skip-db": z.boolean().optional(),
	"skip-plugins": z.boolean().optional(),
	"package-manager": z.string().optional(),
	tsconfig: z.string().optional()
});
const outroText = `🥳 All Done, Happy Hacking!`;
async function initAction(opts) {
	console.log();
	intro("👋 Initializing Better Auth");
	const options = optionsSchema.parse(opts);
	const cwd = path.resolve(options.cwd);
	let packageManagerPreference = void 0;
	let config_path = "";
	let framework = "vanilla";
	const format$1 = async (code) => await format(code, {
		filepath: config_path,
		...defaultFormatOptions
	});
	let packageInfo;
	try {
		packageInfo = getPackageInfo(cwd);
	} catch (error) {
		log.error(`❌ Couldn't read your package.json file. (dir: ${cwd})`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}
	const envFiles = await getEnvFiles(cwd);
	if (!envFiles.length) {
		outro("❌ No .env files found. Please create an env file first.");
		process.exit(0);
	}
	let targetEnvFile;
	if (envFiles.includes(".env")) targetEnvFile = ".env";
	else if (envFiles.includes(".env.local")) targetEnvFile = ".env.local";
	else if (envFiles.includes(".env.development")) targetEnvFile = ".env.development";
	else if (envFiles.length === 1) targetEnvFile = envFiles[0];
	else targetEnvFile = "none";
	let tsconfigInfo;
	try {
		tsconfigInfo = await getTsconfigInfo(cwd, options.tsconfig !== void 0 ? path.resolve(cwd, options.tsconfig) : path.join(cwd, "tsconfig.json"));
	} catch (error) {
		log.error(`❌ Couldn't read your tsconfig.json file. (dir: ${cwd})`);
		console.error(error);
		process.exit(1);
	}
	if (!("compilerOptions" in tsconfigInfo && "strict" in tsconfigInfo.compilerOptions && tsconfigInfo.compilerOptions.strict === true)) {
		log.warn(`Better Auth requires your tsconfig.json to have "compilerOptions.strict" set to true.`);
		const shouldAdd = await confirm({ message: `Would you like us to set ${chalk.bold(`strict`)} to ${chalk.bold(`true`)}?` });
		if (isCancel(shouldAdd)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldAdd) try {
			await fs$1.writeFile(path.join(cwd, "tsconfig.json"), await format(JSON.stringify(Object.assign(tsconfigInfo, { compilerOptions: { strict: true } })), {
				filepath: "tsconfig.json",
				...defaultFormatOptions
			}), "utf-8");
			log.success(`🚀 tsconfig.json successfully updated!`);
		} catch (error) {
			log.error(`Failed to add "compilerOptions.strict" to your tsconfig.json file.`);
			console.error(error);
			process.exit(1);
		}
	}
	const s = spinner({ indicator: "dots" });
	s.start(`Checking better-auth installation`);
	let latest_betterauth_version;
	try {
		latest_betterauth_version = await getLatestNpmVersion("better-auth");
	} catch (error) {
		log.error(`❌ Couldn't get latest version of better-auth.`);
		console.error(error);
		process.exit(1);
	}
	if (!packageInfo.dependencies || !Object.keys(packageInfo.dependencies).includes("better-auth")) {
		s.stop("Finished fetching latest version of better-auth.");
		const s2 = spinner({ indicator: "dots" });
		const shouldInstallBetterAuthDep = await confirm({ message: `Would you like to install Better Auth?` });
		if (isCancel(shouldInstallBetterAuthDep)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (packageManagerPreference === void 0) packageManagerPreference = await getPackageManager();
		if (shouldInstallBetterAuthDep) {
			s2.start(`Installing Better Auth using ${chalk.bold(packageManagerPreference)}`);
			try {
				const start = Date.now();
				await installDependencies({
					dependencies: ["better-auth@latest"],
					packageManager: packageManagerPreference,
					cwd
				});
				s2.stop(`Better Auth installed ${chalk.greenBright(`successfully`)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`);
			} catch (error) {
				s2.stop(`Failed to install Better Auth:`);
				console.error(error);
				process.exit(1);
			}
		}
	} else if (packageInfo.dependencies["better-auth"] !== "workspace:*" && semver.lt(semver.coerce(packageInfo.dependencies["better-auth"])?.toString(), semver.clean(latest_betterauth_version))) {
		s.stop("Finished fetching latest version of better-auth.");
		const shouldInstallBetterAuthDep = await confirm({ message: `Your current Better Auth dependency is out-of-date. Would you like to update it? (${chalk.bold(packageInfo.dependencies["better-auth"])} → ${chalk.bold(`v${latest_betterauth_version}`)})` });
		if (isCancel(shouldInstallBetterAuthDep)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldInstallBetterAuthDep) {
			if (packageManagerPreference === void 0) packageManagerPreference = await getPackageManager();
			const s$1 = spinner({ indicator: "dots" });
			s$1.start(`Updating Better Auth using ${chalk.bold(packageManagerPreference)}`);
			try {
				const start = Date.now();
				await installDependencies({
					dependencies: ["better-auth@latest"],
					packageManager: packageManagerPreference,
					cwd
				});
				s$1.stop(`Better Auth updated ${chalk.greenBright(`successfully`)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`);
			} catch (error) {
				s$1.stop(`Failed to update Better Auth:`);
				log.error(error.message);
				process.exit(1);
			}
		}
	} else s.stop(`Better Auth dependencies are ${chalk.greenBright(`up to date`)}!`);
	const packageJson = getPackageInfo(cwd);
	let appName;
	if (!packageJson.name) {
		const newAppName = await text({ message: "What is the name of your application?" });
		if (isCancel(newAppName)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		appName = newAppName;
	} else appName = packageJson.name;
	let possiblePaths$1 = [
		"auth.ts",
		"auth.tsx",
		"auth.js",
		"auth.jsx"
	];
	possiblePaths$1 = [
		...possiblePaths$1,
		...possiblePaths$1.map((it) => `lib/server/${it}`),
		...possiblePaths$1.map((it) => `server/${it}`),
		...possiblePaths$1.map((it) => `lib/${it}`),
		...possiblePaths$1.map((it) => `utils/${it}`)
	];
	possiblePaths$1 = [
		...possiblePaths$1,
		...possiblePaths$1.map((it) => `src/${it}`),
		...possiblePaths$1.map((it) => `app/${it}`)
	];
	if (options.config) config_path = path.join(cwd, options.config);
	else for (const possiblePath of possiblePaths$1) if (existsSync(path.join(cwd, possiblePath))) {
		config_path = path.join(cwd, possiblePath);
		break;
	}
	let current_user_config = "";
	let database = null;
	let add_plugins = [];
	if (!config_path) {
		const shouldCreateAuthConfig = await select({
			message: `Would you like to create an auth config file?`,
			options: [{
				label: "Yes",
				value: "yes"
			}, {
				label: "No",
				value: "no"
			}]
		});
		if (isCancel(shouldCreateAuthConfig)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldCreateAuthConfig === "yes") {
			const shouldSetupDb = await confirm({
				message: `Would you like to set up your ${chalk.bold(`database`)}?`,
				initialValue: true
			});
			if (isCancel(shouldSetupDb)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			if (shouldSetupDb) {
				const prompted_database = await select({
					message: "Choose a Database Dialect",
					options: supportedDatabases.map((it) => ({
						value: it,
						label: it
					}))
				});
				if (isCancel(prompted_database)) {
					cancel(`✋ Operating cancelled.`);
					process.exit(0);
				}
				database = prompted_database;
			}
			if (options["skip-plugins"] !== false) {
				const shouldSetupPlugins = await confirm({ message: `Would you like to set up ${chalk.bold(`plugins`)}?` });
				if (isCancel(shouldSetupPlugins)) {
					cancel(`✋ Operating cancelled.`);
					process.exit(0);
				}
				if (shouldSetupPlugins) {
					const prompted_plugins = await multiselect({
						message: "Select your new plugins",
						options: supportedPlugins.filter((x) => x.id !== "next-cookies").map((x) => ({
							value: x.id,
							label: x.id
						})),
						required: false
					});
					if (isCancel(prompted_plugins)) {
						cancel(`✋ Operating cancelled.`);
						process.exit(0);
					}
					add_plugins = prompted_plugins.map((x) => supportedPlugins.find((y) => y.id === x));
					for (const possible_next_config_path of [
						"next.config.js",
						"next.config.ts",
						"next.config.mjs",
						".next/server/next.config.js",
						".next/server/next.config.ts",
						".next/server/next.config.mjs"
					]) if (existsSync(path.join(cwd, possible_next_config_path))) {
						framework = "nextjs";
						break;
					}
					if (framework === "nextjs") {
						const result = await confirm({ message: `It looks like you're using NextJS. Do you want to add the next-cookies plugin? ${chalk.bold(`(Recommended)`)}` });
						if (isCancel(result)) {
							cancel(`✋ Operating cancelled.`);
							process.exit(0);
						}
						if (result) add_plugins.push(supportedPlugins.find((x) => x.id === "next-cookies"));
					}
				}
			}
			const filePath = path.join(cwd, "auth.ts");
			config_path = filePath;
			log.info(`Creating auth config file: ${filePath}`);
			try {
				current_user_config = await getDefaultAuthConfig({ appName });
				const { dependencies, envs, generatedCode } = await generateAuthConfig({
					current_user_config,
					format: format$1,
					s,
					plugins: add_plugins,
					database
				});
				current_user_config = generatedCode;
				await fs$1.writeFile(filePath, current_user_config);
				config_path = filePath;
				log.success(`🚀 Auth config file successfully created!`);
				if (envs.length !== 0) {
					log.info(`There are ${envs.length} environment variables for your database of choice.`);
					const shouldUpdateEnvs = await confirm({ message: `Would you like us to update your ENV files?` });
					if (isCancel(shouldUpdateEnvs)) {
						cancel("✋ Operation cancelled.");
						process.exit(0);
					}
					if (shouldUpdateEnvs) {
						const filesToUpdate = await multiselect({
							message: "Select the .env files you want to update",
							options: envFiles.map((x) => ({
								value: path.join(cwd, x),
								label: x
							})),
							required: false
						});
						if (isCancel(filesToUpdate)) {
							cancel("✋ Operation cancelled.");
							process.exit(0);
						}
						if (filesToUpdate.length === 0) log.info("No .env files to update. Skipping...");
						else {
							try {
								await updateEnvs({
									files: filesToUpdate,
									envs,
									isCommented: true
								});
							} catch (error) {
								log.error(`Failed to update .env files:`);
								log.error(JSON.stringify(error, null, 2));
								process.exit(1);
							}
							log.success(`🚀 ENV files successfully updated!`);
						}
					}
				}
				if (dependencies.length !== 0) {
					log.info(`There are ${dependencies.length} dependencies to install. (${dependencies.map((x) => chalk.green(x)).join(", ")})`);
					const shouldInstallDeps = await confirm({ message: `Would you like us to install dependencies?` });
					if (isCancel(shouldInstallDeps)) {
						cancel("✋ Operation cancelled.");
						process.exit(0);
					}
					if (shouldInstallDeps) {
						const s$1 = spinner({ indicator: "dots" });
						if (packageManagerPreference === void 0) packageManagerPreference = await getPackageManager();
						s$1.start(`Installing dependencies using ${chalk.bold(packageManagerPreference)}...`);
						try {
							const start = Date.now();
							await installDependencies({
								dependencies,
								packageManager: packageManagerPreference,
								cwd
							});
							s$1.stop(`Dependencies installed ${chalk.greenBright(`successfully`)} ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`);
						} catch (error) {
							s$1.stop(`Failed to install dependencies using ${packageManagerPreference}:`);
							log.error(error.message);
							process.exit(1);
						}
					}
				}
			} catch (error) {
				log.error(`Failed to create auth config file: ${filePath}`);
				console.error(error);
				process.exit(1);
			}
		} else if (shouldCreateAuthConfig === "no") log.info(`Skipping auth config file creation.`);
	} else {
		log.message();
		log.success(`Found auth config file. ${chalk.gray(`(${config_path})`)}`);
		log.message();
	}
	let possibleClientPaths = [
		"auth-client.ts",
		"auth-client.tsx",
		"auth-client.js",
		"auth-client.jsx",
		"client.ts",
		"client.tsx",
		"client.js",
		"client.jsx"
	];
	possibleClientPaths = [
		...possibleClientPaths,
		...possibleClientPaths.map((it) => `lib/server/${it}`),
		...possibleClientPaths.map((it) => `server/${it}`),
		...possibleClientPaths.map((it) => `lib/${it}`),
		...possibleClientPaths.map((it) => `utils/${it}`)
	];
	possibleClientPaths = [
		...possibleClientPaths,
		...possibleClientPaths.map((it) => `src/${it}`),
		...possibleClientPaths.map((it) => `app/${it}`)
	];
	let authClientConfigPath = null;
	for (const possiblePath of possibleClientPaths) if (existsSync(path.join(cwd, possiblePath))) {
		authClientConfigPath = path.join(cwd, possiblePath);
		break;
	}
	if (!authClientConfigPath) {
		const choice = await select({
			message: `Would you like to create an auth client config file?`,
			options: [{
				label: "Yes",
				value: "yes"
			}, {
				label: "No",
				value: "no"
			}]
		});
		if (isCancel(choice)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (choice === "yes") {
			authClientConfigPath = path.join(cwd, "auth-client.ts");
			log.info(`Creating auth client config file: ${authClientConfigPath}`);
			try {
				const contents = await getDefaultAuthClientConfig({
					auth_config_path: ("./" + path.join(config_path.replace(cwd, ""))).replace(".//", "./"),
					clientPlugins: add_plugins.filter((x) => x.clientName).map((plugin) => {
						let contents$1 = "";
						if (plugin.id === "one-tap") contents$1 = `{ clientId: "MY_CLIENT_ID" }`;
						return {
							contents: contents$1,
							id: plugin.id,
							name: plugin.clientName,
							imports: [{
								path: "better-auth/client/plugins",
								variables: [{ name: plugin.clientName }]
							}]
						};
					}),
					framework
				});
				await fs$1.writeFile(authClientConfigPath, contents);
				log.success(`🚀 Auth client config file successfully created!`);
			} catch (error) {
				log.error(`Failed to create auth client config file: ${authClientConfigPath}`);
				log.error(JSON.stringify(error, null, 2));
				process.exit(1);
			}
		} else if (choice === "no") log.info(`Skipping auth client config file creation.`);
	} else log.success(`Found auth client config file. ${chalk.gray(`(${authClientConfigPath})`)}`);
	if (targetEnvFile !== "none") try {
		const parsed = parse(await fs$1.readFile(path.join(cwd, targetEnvFile), "utf8"));
		let isMissingSecret = false;
		let isMissingUrl = false;
		if (parsed.BETTER_AUTH_SECRET === void 0) isMissingSecret = true;
		if (parsed.BETTER_AUTH_URL === void 0) isMissingUrl = true;
		if (isMissingSecret || isMissingUrl) {
			let txt = "";
			if (isMissingSecret && !isMissingUrl) txt = chalk.bold(`BETTER_AUTH_SECRET`);
			else if (!isMissingSecret && isMissingUrl) txt = chalk.bold(`BETTER_AUTH_URL`);
			else txt = chalk.bold.underline(`BETTER_AUTH_SECRET`) + ` and ` + chalk.bold.underline(`BETTER_AUTH_URL`);
			log.warn(`Missing ${txt} in ${targetEnvFile}`);
			const shouldAdd = await select({
				message: `Do you want to add ${txt} to ${targetEnvFile}?`,
				options: [
					{
						label: "Yes",
						value: "yes"
					},
					{
						label: "No",
						value: "no"
					},
					{
						label: "Choose other file(s)",
						value: "other"
					}
				]
			});
			if (isCancel(shouldAdd)) {
				cancel(`✋ Operation cancelled.`);
				process.exit(0);
			}
			const envs = [];
			if (isMissingSecret) envs.push("BETTER_AUTH_SECRET");
			if (isMissingUrl) envs.push("BETTER_AUTH_URL");
			if (shouldAdd === "yes") {
				try {
					await updateEnvs({
						files: [path.join(cwd, targetEnvFile)],
						envs,
						isCommented: false
					});
				} catch (error) {
					log.error(`Failed to add ENV variables to ${targetEnvFile}`);
					log.error(JSON.stringify(error, null, 2));
					process.exit(1);
				}
				log.success(`🚀 ENV variables successfully added!`);
				if (isMissingUrl) log.info(`Be sure to update your BETTER_AUTH_URL according to your app's needs.`);
			} else if (shouldAdd === "no") log.info(`Skipping ENV step.`);
			else if (shouldAdd === "other") {
				if (!envFiles.length) {
					cancel("No env files found. Please create an env file first.");
					process.exit(0);
				}
				const envFilesToUpdate = await multiselect({
					message: "Select the .env files you want to update",
					options: envFiles.map((x) => ({
						value: path.join(cwd, x),
						label: x
					})),
					required: false
				});
				if (isCancel(envFilesToUpdate)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				if (envFilesToUpdate.length === 0) log.info("No .env files to update. Skipping...");
				else {
					try {
						await updateEnvs({
							files: envFilesToUpdate,
							envs,
							isCommented: false
						});
					} catch (error) {
						log.error(`Failed to update .env files:`);
						log.error(JSON.stringify(error, null, 2));
						process.exit(1);
					}
					log.success(`🚀 ENV files successfully updated!`);
				}
			}
		}
	} catch {}
	outro(outroText);
	console.log();
	process.exit(0);
}
const init = new Command("init").option("-c, --cwd <cwd>", "The working directory.", process.cwd()).option("--config <config>", "The path to the auth configuration file. defaults to the first `auth.ts` file found.").option("--tsconfig <tsconfig>", "The path to the tsconfig file.").option("--skip-db", "Skip the database setup.").option("--skip-plugins", "Skip the plugins setup.").option("--package-manager <package-manager>", "The package manager you want to use.").action(initAction);
async function getLatestNpmVersion(packageName) {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}`);
		if (!response.ok) throw new Error(`Package not found: ${response.statusText}`);
		return (await response.json())["dist-tags"].latest;
	} catch (error) {
		throw error?.message;
	}
}
async function getPackageManager() {
	const { hasBun, hasPnpm } = await checkPackageManagers();
	if (!hasBun && !hasPnpm) return "npm";
	const packageManagerOptions = [];
	if (hasPnpm) packageManagerOptions.push({
		value: "pnpm",
		label: "pnpm",
		hint: "recommended"
	});
	if (hasBun) packageManagerOptions.push({
		value: "bun",
		label: "bun"
	});
	packageManagerOptions.push({
		value: "npm",
		hint: "not recommended"
	});
	const packageManager = await select({
		message: "Choose a package manager",
		options: packageManagerOptions
	});
	if (isCancel(packageManager)) {
		cancel(`Operation cancelled.`);
		process.exit(0);
	}
	return packageManager;
}
async function getEnvFiles(cwd) {
	return (await fs$1.readdir(cwd)).filter((x) => x.startsWith(".env"));
}
async function updateEnvs({ envs, files, isCommented }) {
	let previouslyGeneratedSecret = null;
	for (const file of files) {
		const lines = (await fs$1.readFile(file, "utf8")).split("\n");
		const newLines = envs.map((x) => `${isCommented ? "# " : ""}${x}=${getEnvDescription(x) ?? `"some_value"`}`);
		newLines.push("");
		newLines.push(...lines);
		await fs$1.writeFile(file, newLines.join("\n"), "utf8");
	}
	function getEnvDescription(env) {
		if (env === "DATABASE_HOST") return `"The host of your database"`;
		if (env === "DATABASE_PORT") return `"The port of your database"`;
		if (env === "DATABASE_USER") return `"The username of your database"`;
		if (env === "DATABASE_PASSWORD") return `"The password of your database"`;
		if (env === "DATABASE_NAME") return `"The name of your database"`;
		if (env === "DATABASE_URL") return `"The URL of your database"`;
		if (env === "BETTER_AUTH_SECRET") {
			previouslyGeneratedSecret = previouslyGeneratedSecret ?? generateSecretHash();
			return `"${previouslyGeneratedSecret}"`;
		}
		if (env === "BETTER_AUTH_URL") return `"http://localhost:3000" # Your APP URL`;
	}
}

//#endregion
//#region src/commands/login.ts
const DEMO_URL = "https://demo.better-auth.com";
const CLIENT_ID = "better-auth-cli";
const CONFIG_DIR = path.join(os.homedir(), ".better-auth");
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");
async function loginAction(opts) {
	const options = z.object({
		serverUrl: z.string().optional(),
		clientId: z.string().optional()
	}).parse(opts);
	const serverUrl = options.serverUrl || DEMO_URL;
	const clientId = options.clientId || CLIENT_ID;
	intro(chalk.bold("🔐 Better Auth CLI Login (Demo)"));
	console.log(chalk.yellow("⚠️  This is a demo feature for testing device authorization flow."));
	console.log(chalk.gray("   It connects to the Better Auth demo server for testing purposes.\n"));
	if (await getStoredToken()) {
		const shouldReauth = await confirm({
			message: "You're already logged in. Do you want to log in again?",
			initialValue: false
		});
		if (isCancel(shouldReauth) || !shouldReauth) {
			cancel("Login cancelled");
			process.exit(0);
		}
	}
	const authClient = createAuthClient({
		baseURL: serverUrl,
		plugins: [deviceAuthorizationClient()]
	});
	const spinner$1 = yoctoSpinner({ text: "Requesting device authorization..." });
	spinner$1.start();
	try {
		const { data, error } = await authClient.device.code({
			client_id: clientId,
			scope: "openid profile email"
		});
		spinner$1.stop();
		if (error || !data) {
			console.error(`Failed to request device authorization: ${error?.error_description || "Unknown error"}`);
			process.exit(1);
		}
		const { device_code, user_code, verification_uri, verification_uri_complete, interval = 5, expires_in } = data;
		console.log("");
		console.log(chalk.cyan("📱 Device Authorization Required"));
		console.log("");
		console.log(`Please visit: ${chalk.underline.blue(verification_uri)}`);
		console.log(`Enter code: ${chalk.bold.green(user_code)}`);
		console.log("");
		const shouldOpen = await confirm({
			message: "Open browser automatically?",
			initialValue: true
		});
		if (!isCancel(shouldOpen) && shouldOpen) await open(verification_uri_complete || verification_uri);
		console.log(chalk.gray(`Waiting for authorization (expires in ${Math.floor(expires_in / 60)} minutes)...`));
		const token = await pollForToken(authClient, device_code, clientId, interval);
		if (token) {
			await storeToken(token);
			const { data: session } = await authClient.getSession({ fetchOptions: { headers: { Authorization: `Bearer ${token.access_token}` } } });
			outro(chalk.green(`✅ Demo login successful! Logged in as ${session?.user?.name || session?.user?.email || "User"}`));
			console.log(chalk.gray("\n📝 Note: This was a demo authentication for testing purposes."));
			console.log(chalk.blue("\nFor more information, visit: https://better-auth.com/docs/plugins/device-authorization"));
		}
	} catch (err) {
		spinner$1.stop();
		console.error(`Login failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		process.exit(1);
	}
}
async function pollForToken(authClient, deviceCode, clientId, initialInterval) {
	let pollingInterval = initialInterval;
	const spinner$1 = yoctoSpinner({
		text: "",
		color: "cyan"
	});
	let dots = 0;
	return new Promise((resolve, reject) => {
		const poll = async () => {
			dots = (dots + 1) % 4;
			spinner$1.text = chalk.gray(`Polling for authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`);
			if (!spinner$1.isSpinning) spinner$1.start();
			try {
				const { data, error } = await authClient.device.token({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: deviceCode,
					client_id: clientId,
					fetchOptions: { headers: { "user-agent": `Better Auth CLI` } }
				});
				if (data?.access_token) {
					spinner$1.stop();
					resolve(data);
					return;
				} else if (error) switch (error.error) {
					case "authorization_pending": break;
					case "slow_down":
						pollingInterval += 5;
						spinner$1.text = chalk.yellow(`Slowing down polling to ${pollingInterval}s`);
						break;
					case "access_denied":
						spinner$1.stop();
						console.error("Access was denied by the user");
						process.exit(1);
						break;
					case "expired_token":
						spinner$1.stop();
						console.error("The device code has expired. Please try again.");
						process.exit(1);
						break;
					default:
						spinner$1.stop();
						console.error(`Error: ${error.error_description}`);
						process.exit(1);
				}
			} catch (err) {
				spinner$1.stop();
				console.error(`Network error: ${err instanceof Error ? err.message : "Unknown error"}`);
				process.exit(1);
			}
			setTimeout(poll, pollingInterval * 1e3);
		};
		setTimeout(poll, pollingInterval * 1e3);
	});
}
async function storeToken(token) {
	try {
		await fs$1.mkdir(CONFIG_DIR, { recursive: true });
		const tokenData = {
			access_token: token.access_token,
			token_type: token.token_type || "Bearer",
			scope: token.scope,
			created_at: (/* @__PURE__ */ new Date()).toISOString()
		};
		await fs$1.writeFile(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8");
	} catch {
		console.warn("Failed to store authentication token locally");
	}
}
async function getStoredToken() {
	try {
		const data = await fs$1.readFile(TOKEN_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return null;
	}
}
const login = new Command("login").description("Demo: Test device authorization flow with Better Auth demo server").option("--server-url <url>", "The Better Auth server URL", DEMO_URL).option("--client-id <id>", "The OAuth client ID", CLIENT_ID).action(loginAction);

//#endregion
//#region src/commands/mcp.ts
const REMOTE_MCP_URL = "https://mcp.inkeep.com/better-auth/mcp";
async function mcpAction(options) {
	if (options.cursor) await handleCursorAction();
	else if (options.claudeCode) handleClaudeCodeAction();
	else if (options.openCode) handleOpenCodeAction();
	else if (options.manual) handleManualAction();
	else showAllOptions();
}
async function handleCursorAction() {
	console.log(chalk.bold.blue("🚀 Adding Better Auth MCP to Cursor..."));
	const platform = os$1.platform();
	let openCommand;
	switch (platform) {
		case "darwin":
			openCommand = "open";
			break;
		case "win32":
			openCommand = "start";
			break;
		case "linux":
			openCommand = "xdg-open";
			break;
		default: throw new Error(`Unsupported platform: ${platform}`);
	}
	const remoteConfig = { url: REMOTE_MCP_URL };
	const encodedRemote = base64.encode(new TextEncoder().encode(JSON.stringify(remoteConfig)));
	const remoteDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("better-auth")}&config=${encodedRemote}`;
	try {
		execSync(platform === "win32" ? `start "" "${remoteDeeplink}"` : `${openCommand} "${remoteDeeplink}"`, { stdio: "inherit" });
		console.log(chalk.green("\n✓ Better Auth MCP server installed!"));
	} catch {
		console.log(chalk.yellow("\n⚠ Could not automatically open Cursor for MCP installation."));
	}
	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• The MCP server will be added to your Cursor configuration"));
	console.log(chalk.gray("• You can now use Better Auth features directly in Cursor"));
	console.log(chalk.gray("• Try: \"Set up Better Auth with Google login\" or \"Help me debug my auth\""));
}
function handleClaudeCodeAction() {
	console.log(chalk.bold.blue("🤖 Adding Better Auth MCP to Claude Code..."));
	const command = `claude mcp add --transport http better-auth ${REMOTE_MCP_URL}`;
	try {
		execSync(command, { stdio: "inherit" });
		console.log(chalk.green("\n✓ Claude Code MCP configured!"));
	} catch {
		console.log(chalk.yellow("\n⚠ Could not automatically add to Claude Code. Please run this command manually:"));
		console.log(chalk.cyan(command));
	}
	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• The MCP server will be added to your Claude Code configuration"));
	console.log(chalk.gray("• You can now use Better Auth features directly in Claude Code"));
}
function handleOpenCodeAction() {
	console.log(chalk.bold.blue("🔧 Adding Better Auth MCP to Open Code..."));
	const openCodeConfig = {
		$schema: "https://opencode.ai/config.json",
		mcp: { "better-auth": {
			type: "remote",
			url: REMOTE_MCP_URL,
			enabled: true
		} }
	};
	const configPath = path$1.join(process.cwd(), "opencode.json");
	try {
		let existingConfig = {};
		if (fs$2.existsSync(configPath)) {
			const existingContent = fs$2.readFileSync(configPath, "utf8");
			existingConfig = JSON.parse(existingContent);
		}
		const mergedConfig = {
			...existingConfig,
			...openCodeConfig,
			mcp: {
				...existingConfig.mcp,
				...openCodeConfig.mcp
			}
		};
		fs$2.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
		console.log(chalk.green(`\n✓ Open Code configuration written to ${configPath}`));
		console.log(chalk.green("✓ Better Auth MCP server added successfully!"));
	} catch {
		console.log(chalk.yellow("\n⚠ Could not automatically write opencode.json. Please add this configuration manually:"));
		console.log(chalk.cyan(JSON.stringify(openCodeConfig, null, 2)));
	}
	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart Open Code to load the new MCP server"));
	console.log(chalk.gray("• You can now use Better Auth features directly in Open Code"));
}
function handleManualAction() {
	console.log(chalk.bold.blue("📝 Better Auth MCP Configuration..."));
	const manualConfig = { "better-auth": { url: REMOTE_MCP_URL } };
	const configPath = path$1.join(process.cwd(), "mcp.json");
	try {
		let existingConfig = {};
		if (fs$2.existsSync(configPath)) {
			const existingContent = fs$2.readFileSync(configPath, "utf8");
			existingConfig = JSON.parse(existingContent);
		}
		const mergedConfig = {
			...existingConfig,
			...manualConfig
		};
		fs$2.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
		console.log(chalk.green(`\n✓ MCP configuration written to ${configPath}`));
		console.log(chalk.green("✓ Better Auth MCP server added successfully!"));
	} catch {
		console.log(chalk.yellow("\n⚠ Could not automatically write mcp.json. Please add this configuration manually:"));
		console.log(chalk.cyan(JSON.stringify(manualConfig, null, 2)));
	}
	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart your MCP client to load the new server"));
	console.log(chalk.gray("• You can now use Better Auth features directly in your MCP client"));
}
function showAllOptions() {
	console.log(chalk.bold.blue("🔌 Better Auth MCP Server"));
	console.log(chalk.gray("Choose your MCP client to get started:"));
	console.log();
	console.log(chalk.bold.white("MCP Clients:"));
	console.log(chalk.cyan("  --cursor      ") + chalk.gray("Add to Cursor"));
	console.log(chalk.cyan("  --claude-code ") + chalk.gray("Add to Claude Code"));
	console.log(chalk.cyan("  --open-code   ") + chalk.gray("Add to Open Code"));
	console.log(chalk.cyan("  --manual      ") + chalk.gray("Manual configuration"));
	console.log();
	console.log(chalk.bold.white("Server:"));
	console.log(chalk.gray("  • ") + chalk.white("better-auth") + chalk.gray(" - Search documentation, code examples, setup assistance"));
	console.log();
}
const mcp = new Command("mcp").description("Add Better Auth MCP server to MCP Clients").option("--cursor", "Automatically open Cursor with the MCP configuration").option("--claude-code", "Show Claude Code MCP configuration command").option("--open-code", "Show Open Code MCP configuration").option("--manual", "Show manual MCP configuration for mcp.json").action(mcpAction);

//#endregion
//#region src/commands/migrate.ts
/** @internal */
async function migrateAction(opts) {
	const options = z.object({
		cwd: z.string(),
		config: z.string().optional(),
		y: z.boolean().optional(),
		yes: z.boolean().optional()
	}).parse(opts);
	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}
	const config = await getConfig({
		cwd,
		configPath: options.config
	});
	if (!config) {
		console.error("No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.");
		return;
	}
	const db = await getAdapter(config);
	if (!db) {
		console.error("Invalid database configuration. Make sure you're not using adapters. Migrate command only works with built-in Kysely adapter.");
		process.exit(1);
	}
	if (db.id !== "kysely") {
		if (db.id === "prisma") {
			console.error("The migrate command only works with the built-in Kysely adapter. For Prisma, run `npx @better-auth/cli generate` to create the schema, then use Prisma's migrate or push to apply it.");
			try {
				await (await createTelemetry(config)).publish({
					type: "cli_migrate",
					payload: {
						outcome: "unsupported_adapter",
						adapter: "prisma",
						config: getTelemetryAuthConfig(config)
					}
				});
			} catch {}
			process.exit(0);
		}
		if (db.id === "drizzle") {
			console.error("The migrate command only works with the built-in Kysely adapter. For Drizzle, run `npx @better-auth/cli generate` to create the schema, then use Drizzle's migrate or push to apply it.");
			try {
				await (await createTelemetry(config)).publish({
					type: "cli_migrate",
					payload: {
						outcome: "unsupported_adapter",
						adapter: "drizzle",
						config: getTelemetryAuthConfig(config)
					}
				});
			} catch {}
			process.exit(0);
		}
		console.error("Migrate command isn't supported for this adapter.");
		try {
			await (await createTelemetry(config)).publish({
				type: "cli_migrate",
				payload: {
					outcome: "unsupported_adapter",
					adapter: db.id,
					config: getTelemetryAuthConfig(config)
				}
			});
		} catch {}
		process.exit(1);
	}
	const spinner$1 = yoctoSpinner({ text: "preparing migration..." }).start();
	const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(config);
	if (!toBeAdded.length && !toBeCreated.length) {
		spinner$1.stop();
		console.log("🚀 No migrations needed.");
		try {
			await (await createTelemetry(config)).publish({
				type: "cli_migrate",
				payload: {
					outcome: "no_changes",
					config: getTelemetryAuthConfig(config)
				}
			});
		} catch {}
		process.exit(0);
	}
	spinner$1.stop();
	console.log(`🔑 The migration will affect the following:`);
	for (const table of [...toBeCreated, ...toBeAdded]) console.log("->", chalk.magenta(Object.keys(table.fields).join(", ")), chalk.white("fields on"), chalk.yellow(`${table.table}`), chalk.white("table."));
	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}
	let migrate$1 = options.yes;
	if (!migrate$1) migrate$1 = (await prompts({
		type: "confirm",
		name: "migrate",
		message: "Are you sure you want to run these migrations?",
		initial: false
	})).migrate;
	if (!migrate$1) {
		console.log("Migration cancelled.");
		try {
			await (await createTelemetry(config)).publish({
				type: "cli_migrate",
				payload: {
					outcome: "aborted",
					config: getTelemetryAuthConfig(config)
				}
			});
		} catch {}
		process.exit(0);
	}
	spinner$1?.start("migrating...");
	await runMigrations();
	spinner$1.stop();
	console.log("🚀 migration was completed successfully!");
	try {
		await (await createTelemetry(config)).publish({
			type: "cli_migrate",
			payload: {
				outcome: "migrated",
				config: getTelemetryAuthConfig(config)
			}
		});
	} catch {}
	process.exit(0);
}
const migrate = new Command("migrate").option("-c, --cwd <cwd>", "the working directory. defaults to the current directory.", process.cwd()).option("--config <config>", "the path to the configuration file. defaults to the first configuration file found.").option("-y, --yes", "automatically accept and run migrations without prompting", false).option("--y", "(deprecated) same as --yes", false).action(migrateAction);

//#endregion
//#region src/index.ts
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
async function main() {
	const program = new Command("better-auth");
	let packageInfo = {};
	try {
		packageInfo = await getPackageInfo();
	} catch {}
	program.addCommand(init).addCommand(migrate).addCommand(generate).addCommand(generateSecret).addCommand(info).addCommand(login).addCommand(mcp).version(packageInfo.version || "1.1.2").description("Better Auth CLI").action(() => program.help());
	program.parse();
}
main().catch((error) => {
	console.error("Error running Better Auth CLI:", error);
	process.exit(1);
});

//#endregion
export {  };
//# sourceMappingURL=index.mjs.map