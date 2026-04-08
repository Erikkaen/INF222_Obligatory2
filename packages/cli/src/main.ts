import type { Program } from 'zerow-language';
import { createZerowServices, ZerowLanguageMetaData } from 'zerow-language';
import chalk from 'chalk';
import { Command } from 'commander';
import { extractAstNode } from './util.js';
import {compile, generateOutput} from './generator.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

function loadMod(bytes: BufferSource) {
    const mod = new WebAssembly.Module(bytes);
    return new WebAssembly.Instance(mod).exports;
}

const compileAndRun = async (source: string): Promise<void> => {
    const services = createZerowServices(NodeFileSystem).Zerow;
    const model = await extractAstNode<Program>(source, services);
    const wasmByteCode = compile(model);
    const wasmMain = loadMod(wasmByteCode).main as CallableFunction;
    console.log(chalk.green(`Wasm output: ${wasmMain()}`));
};

export const generateAction = async (source: string, destination: string): Promise<void> => {
    const services = createZerowServices(NodeFileSystem).Zerow;
    const model = await extractAstNode<Program>(source, services);
    const generatedFilePath = generateOutput(model, source, destination);
    console.log(chalk.green(`Code generated succesfully: ${generatedFilePath}`));
};

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);


    // TODO: use Program API to declare the CLI
    const fileExtensions = ZerowLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .argument('<destination>', 'destination file')
        .description('Generates code for a provided source file.')
        .action(generateAction);

    program
        .command('run')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .description('Attempt to compile and run the given program')
        .action(compileAndRun);
    program.parse(process.argv);
}
