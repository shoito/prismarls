#!/usr/bin/env node

import { appendRlsSettingsToMigration, extractRlsFields } from ".";

interface CommandLineArguments {
	schemaFile: string;
	migrationsDir: string;
	currentSetting: string;
	currentUser: boolean;
}

// Parses command line arguments and returns structured data
function parseCommandLineArguments(): CommandLineArguments {
	const schemaArg = process.argv.find((arg) => arg.startsWith("--schema="));
	const migrationsArg = process.argv.find((arg) =>
		arg.startsWith("--migrations="),
	);
	const currentSettingArg = process.argv.find((arg) =>
		arg.startsWith("--currentSetting="),
	);
	const currentUserArg = process.argv.find((arg) =>
		arg.startsWith("--currentUser"),
	);

	return {
		schemaFile: schemaArg ? schemaArg.split("=")[1] : "./prisma/schema.prisma",
		migrationsDir: migrationsArg
			? migrationsArg.split("=")[1]
			: "./prisma/migrations",
		currentSetting: currentSettingArg
			? currentSettingArg.split("=")[1]
			: "app.tenant_id",
		currentUser: !!currentUserArg,
	};
}

function main() {
	const args = parseCommandLineArguments();
	const rlsModels = extractRlsFields(args.schemaFile);
	if (rlsModels.length === 0) {
		console.log("No RLS fields found");
		return;
	}
	appendRlsSettingsToMigration(
		rlsModels,
		args.migrationsDir,
		args.currentSetting,
		args.currentUser,
	);
}

main();
