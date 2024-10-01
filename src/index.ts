import fs from "node:fs";
import path from 'node:path';
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
// Appends RLS settings to the each migration file
export function appendRlsSettingsToMigrations(
    rlsModels: RlsModel[],
    migrationsDir: string,
    currentSettingIsolation: string,
    currentUser: boolean,
    currentSettingBypass: string,
) {
    const migrationDirs = findMigrationDirectories(migrationsDir);
    if (migrationDirs.length === 0) {
        console.log("No migration directories found");
        return;
    }

    for (const dir of migrationDirs) {
        const migrationFilePath = path.join(migrationsDir, dir, 'migration.sql');
        if (!fs.existsSync(migrationFilePath)) {
            console.log(`No migration.sql file found in ${dir}`);
            continue;
        }
        const migrationContent = fs.readFileSync(migrationFilePath, {
			encoding: "utf8",
		});
        if (migrationContent.includes("ENABLE ROW LEVEL SECURITY")) {
            console.log(`RLS already enabled in ${dir}`);
            continue;
        }

        const appendSqls = generateRlsStatements(
            rlsModels,
            migrationContent,
            currentSettingIsolation,
            currentUser,
            currentSettingBypass,
        );
        if (!appendSqls.length) {
            console.log(`No matched tables found in ${dir}`);
            continue;
        }

        fs.appendFileSync(
            migrationFilePath,
            `\n-- RLS Settings\n${appendSqls.join("\n")}\n`,
        );
        console.log(`RLS settings appended to ${dir}/migration.sql`);
    }
}

// Finds the latest migration directory based on naming convention
function findMigrationDirectories(
	migrationsDir: string,
): string[] {
    return fs.readdirSync(migrationsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b) => b.localeCompare(a));
}

// Generates SQL statements for enabling RLS based on existing migrations and RLS models
function generateRlsStatements(
	rlsModels: RlsModel[],
	migrationContent: string,
	currentSettingIsolation: string,
	currentUser: boolean,
	currentSettingBypass: string,
): string[] {
	const createTablePattern = /CREATE TABLE "([^"]+)"/g;
	const matchedTables = Array.from(
		migrationContent.matchAll(createTablePattern),
		(match) => match[1],
	);

	return rlsModels
		.filter((model) => matchedTables.includes(model.table))
		.map((model) => {
			const alterTableEnable = `ALTER TABLE "${model.table}" ENABLE ROW LEVEL SECURITY;`;
			const alterTableForce = `ALTER TABLE "${model.table}" FORCE ROW LEVEL SECURITY;`;
			const createIsolationPolicy = `CREATE POLICY tenant_isolation_policy ON "${model.table}"`;
			const using = currentUser
				? `USING("${model.column}" = current_user);`
				: `USING("${model.column}" = current_setting('${currentSettingIsolation}'));`;
			const createBypassPolicy = `CREATE POLICY bypass_rls_policy ON "${model.table}" USING (current_setting('${currentSettingBypass}', TRUE)::text = 'on');`;
			return `${alterTableEnable}\n${alterTableForce}\n${createIsolationPolicy} ${using}\n${createBypassPolicy}`;
		});
}
