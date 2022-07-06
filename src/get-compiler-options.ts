import * as ts from 'typescript';
import * as path from 'path';
import { format } from 'util';

import { getAbsolutePath } from './helpers/get-absolute-path';
import { checkDiagnosticsErrors } from './helpers/check-diagnostics-errors';
import { verboseLog } from './logger';

const enum Constants {
	NoInputsWereFoundDiagnosticCode = 18003,
}

const parseConfigHost: ts.ParseConfigHost = {
	useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
	readDirectory: ts.sys.readDirectory,
	fileExists: ts.sys.fileExists,
	readFile: ts.sys.readFile,
};

export interface GetCompilerOptionsOpts {
	inputFileNames: readonly string[];
	preferredConfigPath?: string;
	compilerOptions?: ts.CompilerOptions;
}

export function getCompilerOptions(opts: GetCompilerOptionsOpts): ts.CompilerOptions {
	const configFileName = opts.preferredConfigPath ? opts.preferredConfigPath : findConfig(opts);

	if (configFileName) {
		verboseLog(`Using config: ${configFileName}`);
	}
	if (opts.compilerOptions) {
		verboseLog(`Using custom compiler options\n${format(opts.compilerOptions)}`);
	}
	if (!configFileName && !opts.compilerOptions) {
		throw new Error('No config file or compiler options specified in the options');
	}

	const configParseResult = configFileName ? ts.readConfigFile(configFileName, ts.sys.readFile) : {
		config: { compilerOptions: opts.compilerOptions },
		error: undefined,
	};
	checkDiagnosticsErrors(configParseResult.error !== undefined ? [configParseResult.error] : [], 'Error while processing tsconfig file');

	const compilerOptionsParseResult = ts.parseJsonConfigFileContent(
		configParseResult.config,
		parseConfigHost,
		configFileName
			? path.resolve(path.dirname(configFileName))
			: path.resolve(path.dirname(opts.inputFileNames[0])),
		undefined,
		configFileName ? getAbsolutePath(configFileName) : undefined
	);

	// we don't want to raise an error if no inputs found in a config file
	// because this error is mostly for CLI, but we'll pass an inputs in createProgram
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
	const diagnostics = compilerOptionsParseResult.errors.filter((d: ts.Diagnostic) => d.code !== Constants.NoInputsWereFoundDiagnosticCode);

	checkDiagnosticsErrors(diagnostics, 'Error while processing tsconfig compiler options');

	return {
		...compilerOptionsParseResult.options,
		...opts.compilerOptions,
	};
}

function findConfig(opts: GetCompilerOptionsOpts): string | undefined {
	if (!opts.compilerOptions) {
		if (opts.inputFileNames.length > 1) {
			throw new Error('Cannot find tsconfig for multiple files, please specify preferred tsconfig file');
		}
		if (opts.inputFileNames.length <= 0) {
			throw new Error('No input files or preferred tsconfig in the options');
		}
	}

	// input file could be a relative path to the current path
	// and desired config could be outside of current cwd folder
	// so we have to provide absolute path to find config until the root
	const searchPath = getAbsolutePath(opts.inputFileNames[0]);

	const configFileName = ts.findConfigFile(searchPath, ts.sys.fileExists);
	if (!configFileName && !opts.compilerOptions) {
		throw new Error(`Cannot find config file for file ${opts.inputFileNames[0]}`);
	}

	return configFileName;
}
