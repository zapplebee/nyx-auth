import fs, { existsSync } from "node:fs";
import fs$1 from "node:fs/promises";
import path from "node:path";
import { getAuthTables, getMigrations } from "better-auth/db";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import prettier from "prettier";
import { capitalizeFirstLetter } from "@better-auth/core/utils";
import { produceSchema } from "@mrleebo/prisma-ast";

//#region src/generators/drizzle.ts
function convertToSnakeCase(str, camelCase) {
	if (camelCase) return str;
	return str.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
}
const generateDrizzleSchema = async ({ options, file, adapter }) => {
	const tables = getAuthTables(options);
	const filePath = file || "./auth-schema.ts";
	const databaseType = adapter.options?.provider;
	if (!databaseType) throw new Error(`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`);
	const fileExist = existsSync(filePath);
	let code = generateImport({
		databaseType,
		tables,
		options
	});
	const getModelName = initGetModelName({
		schema: tables,
		usePlural: adapter.options?.adapterConfig?.usePlural
	});
	const getFieldName = initGetFieldName({
		schema: tables,
		usePlural: adapter.options?.adapterConfig?.usePlural
	});
	for (const tableKey in tables) {
		const table = tables[tableKey];
		const modelName = getModelName(tableKey);
		const fields = table.fields;
		function getType(name, field) {
			if (!databaseType) throw new Error(`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`);
			name = convertToSnakeCase(name, adapter.options?.camelCase);
			if (field.references?.field === "id") {
				const useNumberId$1 = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				if (useNumberId$1) if (databaseType === "pg") return `integer('${name}')`;
				else if (databaseType === "mysql") return `int('${name}')`;
				else return `integer('${name}')`;
				if (useUUIDs && databaseType === "pg") return `uuid('${name}')`;
				if (field.references.field) {
					if (databaseType === "mysql") return `varchar('${name}', { length: 36 })`;
				}
				return `text('${name}')`;
			}
			const type = field.type;
			if (typeof type !== "string") if (Array.isArray(type) && type.every((x) => typeof x === "string")) return {
				sqlite: `text({ enum: [${type.map((x) => `'${x}'`).join(", ")}] })`,
				pg: `text('${name}', { enum: [${type.map((x) => `'${x}'`).join(", ")}] })`,
				mysql: `mysqlEnum([${type.map((x) => `'${x}'`).join(", ")}])`
			}[databaseType];
			else throw new TypeError(`Invalid field type for field ${name} in model ${modelName}`);
			const dbTypeMap = {
				string: {
					sqlite: `text('${name}')`,
					pg: `text('${name}')`,
					mysql: field.unique ? `varchar('${name}', { length: 255 })` : field.references ? `varchar('${name}', { length: 36 })` : field.sortable ? `varchar('${name}', { length: 255 })` : field.index ? `varchar('${name}', { length: 255 })` : `text('${name}')`
				},
				boolean: {
					sqlite: `integer('${name}', { mode: 'boolean' })`,
					pg: `boolean('${name}')`,
					mysql: `boolean('${name}')`
				},
				number: {
					sqlite: `integer('${name}')`,
					pg: field.bigint ? `bigint('${name}', { mode: 'number' })` : `integer('${name}')`,
					mysql: field.bigint ? `bigint('${name}', { mode: 'number' })` : `int('${name}')`
				},
				date: {
					sqlite: `integer('${name}', { mode: 'timestamp_ms' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}', { fsp: 3 })`
				},
				"number[]": {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: field.bigint ? `bigint('${name}', { mode: 'number' }).array()` : `integer('${name}').array()`,
					mysql: `text('${name}', { mode: 'json' })`
				},
				"string[]": {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: `text('${name}').array()`,
					mysql: `text('${name}', { mode: "json" })`
				},
				json: {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: `jsonb('${name}')`,
					mysql: `json('${name}', { mode: "json" })`
				}
			}[type];
			if (!dbTypeMap) throw new Error(`Unsupported field type '${field.type}' for field '${name}'.`);
			return dbTypeMap[databaseType];
		}
		let id = "";
		const useNumberId = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
		if (options.advanced?.database?.generateId === "uuid" && databaseType === "pg") id = `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`).primaryKey()`;
		else if (useNumberId) if (databaseType === "pg") id = `integer("id").generatedByDefaultAsIdentity().primaryKey()`;
		else if (databaseType === "sqlite") id = `integer("id", { mode: "number" }).primaryKey({ autoIncrement: true })`;
		else id = `int("id").autoincrement().primaryKey()`;
		else if (databaseType === "mysql") id = `varchar('id', { length: 36 }).primaryKey()`;
		else if (databaseType === "pg") id = `text('id').primaryKey()`;
		else id = `text('id').primaryKey()`;
		const indexes = [];
		const assignIndexes = (indexes$1) => {
			if (!indexes$1.length) return "";
			const code$1 = [`, (table) => [`];
			for (const index of indexes$1) code$1.push(`  ${index.type}("${index.name}").on(table.${index.on}),`);
			code$1.push(`]`);
			return code$1.join("\n");
		};
		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(modelName, adapter.options?.camelCase)}", {
					id: ${id},
					${Object.keys(fields).map((field) => {
			const attr = fields[field];
			const fieldName = attr.fieldName || field;
			let type = getType(fieldName, attr);
			if (attr.index && !attr.unique) indexes.push({
				type: "index",
				name: `${modelName}_${fieldName}_idx`,
				on: fieldName
			});
			else if (attr.index && attr.unique) indexes.push({
				type: "uniqueIndex",
				name: `${modelName}_${fieldName}_uidx`,
				on: fieldName
			});
			if (attr.defaultValue !== null && typeof attr.defaultValue !== "undefined") if (typeof attr.defaultValue === "function") {
				if (attr.type === "date" && attr.defaultValue.toString().includes("new Date()")) if (databaseType === "sqlite") type += `.default(sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`)`;
				else type += `.defaultNow()`;
			} else if (typeof attr.defaultValue === "string") type += `.default("${attr.defaultValue}")`;
			else type += `.default(${attr.defaultValue})`;
			if (attr.onUpdate && attr.type === "date") {
				if (typeof attr.onUpdate === "function") type += `.$onUpdate(${attr.onUpdate})`;
			}
			return `${fieldName}: ${type}${attr.required ? ".notNull()" : ""}${attr.unique ? ".unique()" : ""}${attr.references ? `.references(()=> ${getModelName(attr.references.model)}.${getFieldName({
				model: attr.references.model,
				field: attr.references.field
			})}, { onDelete: '${attr.references.onDelete || "cascade"}' })` : ""}`;
		}).join(",\n ")}
					}${assignIndexes(indexes)});`;
		code += `\n${schema}\n`;
	}
	let relationsString = "";
	for (const tableKey in tables) {
		const table = tables[tableKey];
		const modelName = getModelName(tableKey);
		const oneRelations = [];
		const manyRelations = [];
		const manyRelationsSet = /* @__PURE__ */ new Set();
		const foreignFields = Object.entries(table.fields).filter(([_, field]) => field.references);
		for (const [fieldName, field] of foreignFields) {
			const referencedModel = field.references.model;
			const relationKey = getModelName(referencedModel);
			const fieldRef = `${getModelName(tableKey)}.${getFieldName({
				model: tableKey,
				field: fieldName
			})}`;
			const referenceRef = `${getModelName(referencedModel)}.${getFieldName({
				model: referencedModel,
				field: field.references.field || "id"
			})}`;
			oneRelations.push({
				key: relationKey,
				model: getModelName(referencedModel),
				type: "one",
				reference: {
					field: fieldRef,
					references: referenceRef,
					fieldName
				}
			});
		}
		const otherModels = Object.entries(tables).filter(([modelName$1]) => modelName$1 !== tableKey);
		const modelRelationsMap = /* @__PURE__ */ new Map();
		for (const [modelName$1, otherTable] of otherModels) {
			const foreignKeysPointingHere = Object.entries(otherTable.fields).filter(([_, field]) => field.references?.model === tableKey || field.references?.model === getModelName(tableKey));
			if (foreignKeysPointingHere.length === 0) continue;
			const hasUnique = foreignKeysPointingHere.some(([_, field]) => !!field.unique);
			const hasMany$1 = foreignKeysPointingHere.some(([_, field]) => !field.unique);
			modelRelationsMap.set(modelName$1, {
				modelName: modelName$1,
				hasUnique,
				hasMany: hasMany$1
			});
		}
		for (const { modelName: modelName$1, hasMany: hasMany$1 } of modelRelationsMap.values()) {
			const relationType = hasMany$1 ? "many" : "one";
			let relationKey = getModelName(modelName$1);
			if (!adapter.options?.adapterConfig?.usePlural && relationType === "many") relationKey = `${relationKey}s`;
			if (!manyRelationsSet.has(relationKey)) {
				manyRelationsSet.add(relationKey);
				manyRelations.push({
					key: relationKey,
					model: getModelName(modelName$1),
					type: relationType
				});
			}
		}
		const relationsByModel = /* @__PURE__ */ new Map();
		for (const relation of oneRelations) if (relation.reference) {
			const modelKey = relation.key;
			if (!relationsByModel.has(modelKey)) relationsByModel.set(modelKey, []);
			relationsByModel.get(modelKey).push(relation);
		}
		const duplicateRelations = [];
		const singleRelations = [];
		for (const [_modelKey, relations] of relationsByModel.entries()) if (relations.length > 1) duplicateRelations.push(...relations);
		else singleRelations.push(relations[0]);
		for (const relation of duplicateRelations) if (relation.reference) {
			const fieldName = relation.reference.fieldName;
			const tableRelation = `export const ${`${modelName}${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Relations`} = relations(${getModelName(table.modelName)}, ({ one }) => ({
				${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})
			}))`;
			relationsString += `\n${tableRelation}\n`;
		}
		const hasOne = singleRelations.length > 0;
		const hasMany = manyRelations.length > 0;
		if (hasOne && hasMany) {
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(table.modelName)}, ({ one, many }) => ({
				${singleRelations.map((relation) => relation.reference ? ` ${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})` : "").filter((x) => x !== "").join(",\n ")}${singleRelations.length > 0 && manyRelations.length > 0 ? "," : ""}
				${manyRelations.map(({ key, model }) => ` ${key}: many(${model})`).join(",\n ")}
			}))`;
			relationsString += `\n${tableRelation}\n`;
		} else if (hasOne) {
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(table.modelName)}, ({ one }) => ({
				${singleRelations.map((relation) => relation.reference ? ` ${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})` : "").filter((x) => x !== "").join(",\n ")}
			}))`;
			relationsString += `\n${tableRelation}\n`;
		} else if (hasMany) {
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(table.modelName)}, ({ many }) => ({
				${manyRelations.map(({ key, model }) => ` ${key}: many(${model})`).join(",\n ")}
			}))`;
			relationsString += `\n${tableRelation}\n`;
		}
	}
	code += `\n${relationsString}`;
	return {
		code: await prettier.format(code, { parser: "typescript" }),
		fileName: filePath,
		overwrite: fileExist
	};
};
function generateImport({ databaseType, tables, options }) {
	const rootImports = ["relations"];
	const coreImports = [];
	let hasBigint = false;
	let hasJson = false;
	for (const table of Object.values(tables)) {
		for (const field of Object.values(table.fields)) {
			if (field.bigint) hasBigint = true;
			if (field.type === "json") hasJson = true;
		}
		if (hasJson && hasBigint) break;
	}
	const useNumberId = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
	const useUUIDs = options.advanced?.database?.generateId === "uuid";
	coreImports.push(`${databaseType}Table`);
	coreImports.push(databaseType === "mysql" ? "varchar, text" : databaseType === "pg" ? "text" : "text");
	coreImports.push(hasBigint ? databaseType !== "sqlite" ? "bigint" : "" : "");
	coreImports.push(databaseType !== "sqlite" ? "timestamp, boolean" : "");
	if (databaseType === "mysql") {
		const hasNonBigintNumber = Object.values(tables).some((table) => Object.values(table.fields).some((field) => (field.type === "number" || field.type === "number[]") && !field.bigint));
		if (!!useNumberId || hasNonBigintNumber) coreImports.push("int");
		if (Object.values(tables).some((table) => Object.values(table.fields).some((field) => typeof field.type !== "string" && Array.isArray(field.type) && field.type.every((x) => typeof x === "string")))) coreImports.push("mysqlEnum");
	} else if (databaseType === "pg") {
		if (useUUIDs) rootImports.push("sql");
		const hasNonBigintNumber = Object.values(tables).some((table) => Object.values(table.fields).some((field) => (field.type === "number" || field.type === "number[]") && !field.bigint));
		const hasFkToId = Object.values(tables).some((table) => Object.values(table.fields).some((field) => field.references?.field === "id"));
		if (hasNonBigintNumber || (options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial") && hasFkToId) coreImports.push("integer");
	} else coreImports.push("integer");
	if (databaseType === "pg" && useUUIDs) coreImports.push("uuid");
	if (hasJson) {
		if (databaseType === "pg") coreImports.push("jsonb");
		if (databaseType === "mysql") coreImports.push("json");
	}
	if (databaseType === "sqlite" && Object.values(tables).some((table) => Object.values(table.fields).some((field) => field.type === "date" && field.defaultValue && typeof field.defaultValue === "function" && field.defaultValue.toString().includes("new Date()")))) rootImports.push("sql");
	const hasIndexes = Object.values(tables).some((table) => Object.values(table.fields).some((field) => field.index && !field.unique));
	const hasUniqueIndexes = Object.values(tables).some((table) => Object.values(table.fields).some((field) => field.unique && field.index));
	if (hasIndexes) coreImports.push("index");
	if (hasUniqueIndexes) coreImports.push("uniqueIndex");
	return `${rootImports.length > 0 ? `import { ${rootImports.join(", ")} } from "drizzle-orm";\n` : ""}import { ${coreImports.map((x) => x.trim()).filter((x) => x !== "").join(", ")} } from "drizzle-orm/${databaseType}-core";\n`;
}

//#endregion
//#region src/generators/kysely.ts
const generateKyselySchema = async ({ options, file }) => {
	const { compileMigrations } = await getMigrations(options);
	const migrations = await compileMigrations();
	return {
		code: migrations.trim() === ";" ? "" : migrations,
		fileName: file || `./better-auth_migrations/${(/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-")}.sql`
	};
};

//#endregion
//#region src/utils/get-package-info.ts
function getPackageInfo(cwd) {
	const packageJsonPath = cwd ? path.join(cwd, "package.json") : path.join("package.json");
	return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
}
function getPrismaVersion(cwd) {
	try {
		const packageInfo = getPackageInfo(cwd);
		const prismaVersion = packageInfo.dependencies?.prisma || packageInfo.devDependencies?.prisma || packageInfo.dependencies?.["@prisma/client"] || packageInfo.devDependencies?.["@prisma/client"];
		if (!prismaVersion) return null;
		const match = prismaVersion.match(/(\d+)/);
		return match ? parseInt(match[1], 10) : null;
	} catch {
		return null;
	}
}

//#endregion
//#region src/generators/prisma.ts
const generatePrismaSchema = async ({ adapter, options, file }) => {
	const provider = adapter.options?.provider || "postgresql";
	const tables = getAuthTables(options);
	const filePath = file || "./prisma/schema.prisma";
	const schemaPrismaExist = existsSync(path.join(process.cwd(), filePath));
	const getModelName = initGetModelName({
		schema: getAuthTables(options),
		usePlural: adapter.options?.adapterConfig?.usePlural
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(options),
		usePlural: false
	});
	let schemaPrisma = "";
	if (schemaPrismaExist) schemaPrisma = await fs$1.readFile(path.join(process.cwd(), filePath), "utf-8");
	else schemaPrisma = getNewPrisma(provider, process.cwd());
	const prismaVersion = getPrismaVersion(process.cwd());
	if (prismaVersion && prismaVersion >= 7 && schemaPrismaExist) schemaPrisma = produceSchema(schemaPrisma, (builder) => {
		const generator = builder.findByType("generator", { name: "client" });
		if (generator && generator.properties) {
			const providerProp = generator.properties.find((prop) => prop.type === "assignment" && prop.key === "provider");
			if (providerProp && providerProp.value === "\"prisma-client-js\"") providerProp.value = "\"prisma-client\"";
		}
	});
	const manyToManyRelations = /* @__PURE__ */ new Map();
	for (const table in tables) {
		const fields = tables[table]?.fields;
		for (const field in fields) {
			const attr = fields[field];
			if (attr.references) {
				const referencedOriginalModel = attr.references.model;
				const referencedModelNameCap = capitalizeFirstLetter(getModelName(tables[referencedOriginalModel]?.modelName || referencedOriginalModel));
				if (!manyToManyRelations.has(referencedModelNameCap)) manyToManyRelations.set(referencedModelNameCap, /* @__PURE__ */ new Set());
				const currentModelNameCap = capitalizeFirstLetter(getModelName(tables[table]?.modelName || table));
				manyToManyRelations.get(referencedModelNameCap).add(currentModelNameCap);
			}
		}
	}
	const indexedFields = /* @__PURE__ */ new Map();
	for (const table in tables) {
		const fields = tables[table]?.fields;
		const modelName = capitalizeFirstLetter(getModelName(tables[table]?.modelName || table));
		indexedFields.set(modelName, []);
		for (const field in fields) {
			const attr = fields[field];
			if (attr.index && !attr.unique) {
				const fieldName = attr.fieldName || field;
				indexedFields.get(modelName).push(fieldName);
			}
		}
	}
	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			const originalTableName = table;
			const customModelName = tables[table]?.modelName || table;
			const modelName = capitalizeFirstLetter(getModelName(customModelName));
			const fields = tables[table]?.fields;
			function getType({ isBigint, isOptional, type }) {
				if (type === "string") return isOptional ? "String?" : "String";
				if (type === "number" && isBigint) return isOptional ? "BigInt?" : "BigInt";
				if (type === "number") return isOptional ? "Int?" : "Int";
				if (type === "boolean") return isOptional ? "Boolean?" : "Boolean";
				if (type === "date") return isOptional ? "DateTime?" : "DateTime";
				if (type === "json") {
					if (provider === "sqlite" || provider === "mysql") return isOptional ? "String?" : "String";
					return isOptional ? "Json?" : "Json";
				}
				if (type === "string[]") {
					if (provider === "sqlite" || provider === "mysql") return isOptional ? "String?" : "String";
					return "String[]";
				}
				if (type === "number[]") {
					if (provider === "sqlite" || provider === "mysql") return "String";
					return "Int[]";
				}
			}
			const prismaModel = builder.findByType("model", { name: modelName });
			if (!prismaModel) if (provider === "mongodb") builder.model(modelName).field("id", "String").attribute("id").attribute(`map("_id")`);
			else {
				const useNumberId = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				if (useNumberId) builder.model(modelName).field("id", "Int").attribute("id").attribute("default(autoincrement())");
				else if (useUUIDs && provider === "postgresql") builder.model(modelName).field("id", "String").attribute("id").attribute("default(dbgenerated(\"pg_catalog.gen_random_uuid()\"))").attribute("db.Uuid");
				else builder.model(modelName).field("id", "String").attribute("id");
			}
			for (const field in fields) {
				const attr = fields[field];
				const fieldName = attr.fieldName || field;
				if (prismaModel) {
					if (builder.findByType("field", {
						name: fieldName,
						within: prismaModel.properties
					})) continue;
				}
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const useNumberId = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
				const fieldBuilder = builder.model(modelName).field(fieldName, field === "id" && useNumberId ? getType({
					isBigint: false,
					isOptional: false,
					type: "number"
				}) : getType({
					isBigint: attr?.bigint || false,
					isOptional: !attr?.required,
					type: attr.references?.field === "id" ? useNumberId ? "number" : "string" : attr.type
				}));
				if (field === "id") {
					fieldBuilder.attribute("id");
					if (provider === "mongodb") fieldBuilder.attribute(`map("_id")`);
				}
				if (attr.unique) builder.model(modelName).blockAttribute(`unique([${fieldName}])`);
				if (attr.defaultValue !== void 0) {
					if (Array.isArray(attr.defaultValue)) {
						if (attr.type === "json") {
							if (Object.prototype.toString.call(attr.defaultValue[0]) === "[object Object]") {
								fieldBuilder.attribute(`default("${JSON.stringify(attr.defaultValue).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`);
								continue;
							}
							const jsonArray = [];
							for (const value of attr.defaultValue) jsonArray.push(value);
							fieldBuilder.attribute(`default("${JSON.stringify(jsonArray).replace(/"/g, "\\\"")}")`);
							continue;
						}
						if (attr.defaultValue.length === 0) {
							fieldBuilder.attribute(`default([])`);
							continue;
						} else if (typeof attr.defaultValue[0] === "string" && attr.type === "string[]") {
							const valueArray = [];
							for (const value of attr.defaultValue) valueArray.push(JSON.stringify(value));
							fieldBuilder.attribute(`default([${valueArray}])`);
						} else if (typeof attr.defaultValue[0] === "number") {
							const valueArray = [];
							for (const value of attr.defaultValue) valueArray.push(`${value}`);
							fieldBuilder.attribute(`default([${valueArray}])`);
						}
					} else if (typeof attr.defaultValue === "object" && !Array.isArray(attr.defaultValue) && attr.defaultValue !== null) {
						if (Object.entries(attr.defaultValue).length === 0) {
							fieldBuilder.attribute(`default("{}")`);
							continue;
						}
						fieldBuilder.attribute(`default("${JSON.stringify(attr.defaultValue).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`);
					}
					if (field === "createdAt") fieldBuilder.attribute("default(now())");
					else if (typeof attr.defaultValue === "string" && provider !== "mysql") fieldBuilder.attribute(`default("${attr.defaultValue}")`);
					else if (typeof attr.defaultValue === "boolean" || typeof attr.defaultValue === "number") fieldBuilder.attribute(`default(${attr.defaultValue})`);
					else if (typeof attr.defaultValue === "function") {}
				}
				if (field === "updatedAt" && attr.onUpdate) fieldBuilder.attribute("updatedAt");
				else if (attr.onUpdate) {}
				if (attr.references) {
					if (useUUIDs && provider === "postgresql" && attr.references?.field === "id") builder.model(modelName).field(fieldName).attribute(`db.Uuid`);
					const referencedOriginalModelName = getModelName(attr.references.model);
					const referencedCustomModelName = tables[referencedOriginalModelName]?.modelName || referencedOriginalModelName;
					let action = "Cascade";
					if (attr.references.onDelete === "no action") action = "NoAction";
					else if (attr.references.onDelete === "set null") action = "SetNull";
					else if (attr.references.onDelete === "set default") action = "SetDefault";
					else if (attr.references.onDelete === "restrict") action = "Restrict";
					const relationField = `relation(fields: [${getFieldName({
						model: originalTableName,
						field: fieldName
					})}], references: [${getFieldName({
						model: attr.references.model,
						field: attr.references.field
					})}], onDelete: ${action})`;
					builder.model(modelName).field(referencedCustomModelName.toLowerCase(), `${capitalizeFirstLetter(referencedCustomModelName)}${!attr.required ? "?" : ""}`).attribute(relationField);
				}
				if (!attr.unique && !attr.references && provider === "mysql" && attr.type === "string") builder.model(modelName).field(fieldName).attribute("db.Text");
			}
			if (manyToManyRelations.has(modelName)) for (const relatedModel of manyToManyRelations.get(modelName)) {
				const relatedTableName = Object.keys(tables).find((key) => capitalizeFirstLetter(tables[key]?.modelName || key) === relatedModel);
				const relatedFields = relatedTableName ? tables[relatedTableName]?.fields : {};
				const [_fieldKey, fkFieldAttr] = Object.entries(relatedFields || {}).find(([_fieldName, fieldAttr]) => fieldAttr.references && getModelName(fieldAttr.references.model) === getModelName(originalTableName)) || [];
				const isUnique = fkFieldAttr?.unique === true;
				const fieldName = isUnique || adapter.options?.usePlural === true ? `${relatedModel.toLowerCase()}` : `${relatedModel.toLowerCase()}s`;
				if (!builder.findByType("field", {
					name: fieldName,
					within: prismaModel?.properties
				})) builder.model(modelName).field(fieldName, `${relatedModel}${isUnique ? "?" : "[]"}`);
			}
			const indexedFieldsForModel = indexedFields.get(modelName);
			if (indexedFieldsForModel && indexedFieldsForModel.length > 0) for (const fieldName of indexedFieldsForModel) {
				if (prismaModel) {
					if (prismaModel.properties.some((v) => v.type === "attribute" && v.name === "index" && JSON.stringify(v.args[0]?.value).includes(fieldName))) continue;
				}
				const field = Object.entries(fields).find(([key, attr]) => (attr.fieldName || key) === fieldName)?.[1];
				let indexField = fieldName;
				if (provider === "mysql" && field && field.type === "string") {
					const useNumberId = options.advanced?.database?.useNumberId || options.advanced?.database?.generateId === "serial";
					const useUUIDs = options.advanced?.database?.generateId === "uuid";
					if (field.references?.field === "id" && (useNumberId || useUUIDs)) indexField = `${fieldName}`;
					else indexField = `${fieldName}(length: 191)`;
				}
				builder.model(modelName).blockAttribute(`index([${indexField}])`);
			}
			const hasAttribute = builder.findByType("attribute", {
				name: "map",
				within: prismaModel?.properties
			});
			const hasChanged = customModelName !== originalTableName;
			if (!hasAttribute) builder.model(modelName).blockAttribute("map", `${getModelName(hasChanged ? customModelName : originalTableName)}`);
		}
	});
	const schemaChanged = schema.trim() !== schemaPrisma.trim();
	return {
		code: schemaChanged ? schema : "",
		fileName: filePath,
		overwrite: schemaPrismaExist && schemaChanged
	};
};
const getNewPrisma = (provider, cwd) => {
	const prismaVersion = getPrismaVersion(cwd);
	return `generator client {
    provider = "${prismaVersion && prismaVersion >= 7 ? "prisma-client" : "prisma-client-js"}"
  }

  datasource db {
    provider = "${provider}"
    url      = ${provider === "sqlite" ? `"file:./dev.db"` : `env("DATABASE_URL")`}
  }`;
};

//#endregion
//#region src/generators/index.ts
const adapters = {
	prisma: generatePrismaSchema,
	drizzle: generateDrizzleSchema,
	kysely: generateKyselySchema
};
const generateSchema = (opts) => {
	const adapter = opts.adapter;
	const generator = adapter.id in adapters ? adapters[adapter.id] : null;
	if (generator) return generator(opts);
	if (adapter.createSchema) return adapter.createSchema(opts.options, opts.file).then(({ code, path: fileName, overwrite }) => ({
		code,
		fileName,
		overwrite
	}));
	throw new Error(`${adapter.id} is not supported. If it is a custom adapter, please request the maintainer to implement createSchema`);
};

//#endregion
export { generateKyselySchema as a, getPackageInfo as i, generateSchema as n, generateDrizzleSchema as o, generatePrismaSchema as r, adapters as t };
//# sourceMappingURL=generators-Ht8QYIi_.mjs.map