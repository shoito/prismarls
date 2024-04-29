import fs from "node:fs";
import {
	type FieldDeclaration,
	type ModelDeclaration,
	parsePrismaSchema,
} from "@loancrate/prisma-schema-parser";

interface RlsModel {
	table: string;
	column: string;
}

// Extracts RLS fields from the schema file
export function extractRlsFields(schemaFile: string): RlsModel[] {
	const declarations: ModelDeclaration[] = parsePrismaSchema(
		fs.readFileSync(schemaFile, { encoding: "utf8" }),
	).declarations.filter(
		(declaration) => declaration.kind === "model",
	) as ModelDeclaration[];
	return declarations
		.flatMap((model: ModelDeclaration) =>
			model.members
				.filter(
					(member) =>
						member.kind === "field" && member.comment?.text.includes("@RLS"),
				)
				.map((f: unknown) => {
					const field = f as FieldDeclaration;
					const comment = field.comment?.text ?? "";
					const tableMatch = comment.match(/table: "([^"]+)"/);
					const columnMatch = comment.match(/column: "([^"]+)"/);
					return {
						table: tableMatch ? tableMatch[1] : model.name.value,
						column: columnMatch ? columnMatch[1] : field.name.value,
					};
				}),
		)
		.filter((model) => model);
}

// Appends RLS settings to the latest migration file
export function appendRlsSettingsToMigration(
	rlsModels: RlsModel[],
	migrationsDir: string,
	currentSetting: string,
	currentUser: boolean,
) {
	const latestMigrationDir = findLatestMigrationDirectory(migrationsDir);
	if (!latestMigrationDir) {
		console.log("No migration directory found");
		return;
	}

	const migrationFilePath = `${migrationsDir}/${latestMigrationDir}/migration.sql`;
	const migrationContent = fs.readFileSync(migrationFilePath, {
		encoding: "utf8",
	});
	if (migrationContent.includes("ENABLE ROW LEVEL SECURITY")) {
		console.log("RLS already enabled");
		return;
	}

	const appendSqls = generateRlsStatements(
		rlsModels,
		migrationContent,
		currentSetting,
		currentUser,
	);
	if (!appendSqls.length) {
		console.log("No matched tables found");
		return;
	}

	fs.appendFileSync(
		migrationFilePath,
		`\n-- RLS Settings\n${appendSqls.join("\n")}\n`,
	);
}

// Finds the latest migration directory based on naming convention
function findLatestMigrationDirectory(
	migrationsDir: string,
): string | undefined {
	const directories = fs
		.readdirSync(migrationsDir, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.sort((a, b) => b.localeCompare(a));

	return directories.length > 0 ? directories[0] : undefined;
}

// Generates SQL statements for enabling RLS based on existing migrations and RLS models
function generateRlsStatements(
	rlsModels: RlsModel[],
	migrationContent: string,
	currentSetting: string,
	currentUser: boolean,
): string[] {
	const createTablePattern = /CREATE TABLE "([^"]+)"/g;
	const matchedTables = Array.from(
		migrationContent.matchAll(createTablePattern),
		(match) => match[1],
	);

	return rlsModels
		.filter((model) => matchedTables.includes(model.table))
		.map((model) => {
			const alterTable = `ALTER TABLE "${model.table}" ENABLE ROW LEVEL SECURITY;`;
			const createPolicy = `CREATE POLICY "${model.table}_${model.column}_policy" ON "${model.table}"`;
			const using = currentUser
				? `USING("${model.column}" = current_user);`
				: `USING("${model.column}" = current_setting('${currentSetting}'));`;
			return `${alterTable}\n${createPolicy} ${using}`;
		});
}
