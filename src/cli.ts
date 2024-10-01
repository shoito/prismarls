#!/usr/bin/env node

import { appendRlsSettingsToMigrations, extractRlsFields } from ".";

interface CommandLineArguments {
	schemaFile: string;
	migrationsDir: string;
	currentSettingIsolation: string;
	currentUser: boolean;
	currentSettingBypass: string;
}

// Parses command line arguments and returns structured data
function parseCommandLineArguments(): CommandLineArguments {
	const schemaArg = process.argv.find((arg) => arg.startsWith("--schema="));
	const migrationsArg = process.argv.find((arg) =>
		arg.startsWith("--migrations="),
	);
	const currentSettingIsolationArg = process.argv.find((arg) =>
		arg.startsWith("--currentSettingIsolation="),
	);
	const currentUserArg = process.argv.find((arg) =>
		arg.startsWith("--currentUser"),
	);
	const currentSettingBypassArg = process.argv.find((arg) =>
		arg.startsWith("--currentSettingBypass="),
	);

	return {
		schemaFile: schemaArg ? schemaArg.split("=")[1] : "./prisma/schema.prisma",
		migrationsDir: migrationsArg
			? migrationsArg.split("=")[1]
			: "./prisma/migrations",
		currentSettingIsolation: currentSettingIsolationArg
			? currentSettingIsolationArg.split("=")[1]
			: "app.tenant_id",
		currentUser: !!currentUserArg,
		currentSettingBypass: currentSettingBypassArg
			? currentSettingBypassArg.split("=")[1]
			: "app.bypass_rls",
	};
}

function main() {
	const args = parseCommandLineArguments();
	const rlsModels = extractRlsFields(args.schemaFile);
	if (rlsModels.length === 0) {
		console.log("No RLS fields found");
		return;
	}
	appendRlsSettingsToMigrations(
		rlsModels,
		args.migrationsDir,
		args.currentSettingIsolation,
		args.currentUser,
		args.currentSettingBypass,
	);
}

main();
