import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export async function extractDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(chalk.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(chalk.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red('There are validation errors:'));
        for (const validationError of validationErrors) {
            console.error(chalk.red(
                `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(validationError.range)}]`
            ));
        }
        process.exit(1);
    }



    return document;
}

export async function extractAstNode<T extends AstNode>(fileName: string, services: LangiumCoreServices): Promise<T> {
    return (await extractDocument(fileName, services)).parseResult?.value as T;
}

interface FilePathData {
    destination: string,
    name: string
}

export function extractDestinationAndName(destination: string): FilePathData {
    return {
        destination: path.dirname(destination),
        name: path.basename(destination)
    };
}

export function stringToBytes(s: string): number[] {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes);
}

export function magic(): number[] {
    return stringToBytes("\0asm");
}

export function version(): number[] {
    return [0x01, 0x00, 0x00, 0x00];
}

const CONTINUATION_BIT = 0b10000000;
const SEVEN_BIT_MASK_BIG_INT = 0b01111111n;

function leb128(v: number): number[] {
    let val = BigInt(v);
    let more = true;
    const r = [];

    while (more) {
        const b = Number(val & SEVEN_BIT_MASK_BIG_INT);
        val = val >> 7n;
        more = val !== 0n;
        if (more) {
            r.push(b | CONTINUATION_BIT);
        } else {
            r.push(b);
        }
    }
    return r;
}

function sleb128(v: number): number[] {
    let val = BigInt(v);
    let more = true;
    const r = [];

    while (more) {
        const b = Number(val & SEVEN_BIT_MASK_BIG_INT);
        const signBitSet = !!(b & 0x40);
        val = val >> 7n;
        if ((val === 0n && !signBitSet) || (val === -1n && signBitSet)) {
            more = false;
            r.push(b);
        } else {
            r.push(b | CONTINUATION_BIT);
        }
    }
    return r;
}

const MIN_U32 = 0;
const MAX_U32 = 2 ** 32 - 1;
const MIN_I32 = -(2 ** 32 / 2);
const MAX_I32 = 2 ** 32 / 2 - 1;
const I32_NEG_OFFSET = 2 ** 32;

/**
 * Encode a JavaScript number as an unsigned 32-bit integer using
 * LEB128 encoding (the format used by the WebAssembly binary spec).
 *
 * Steps to implement:
 * 1. Validate that the value is within the valid range of an unsigned
 *    32-bit integer: [0, 2^32 - 1].
 * 2. If the value is outside this range, throw an error.
 * 3. Encode the number using unsigned LEB128 encoding.
 *    LEB128 encodes integers in a variable number of bytes where
 *    the lower 7 bits of each byte store data and the highest bit
 *    indicates whether more bytes follow.
 * 4. Return the resulting sequence of bytes as a number[].
 */
export function u32(v: number): number[] {
    if (v < MIN_U32 || v > MAX_U32) {
        throw Error("value is out of range for u32: ${v}");
    }
    return leb128(v);
}

/**
 * Encode a JavaScript number as a signed 32-bit integer using
 * signed LEB128 encoding (SLEB128).
 *
 * Steps:
 * 1. Ensure the value fits within the allowed signed 32-bit range
 *    [-2^31, 2^31 - 1].
 * 2. Throw an error if it is outside this range.
 * 3. If the number represents a negative value stored using unsigned
 *    arithmetic (i.e., larger than MAX_I32), convert it by subtracting
 *    the constant offset that maps it into the signed range.
 * 4. Encode the final value using signed LEB128 encoding.
 * 5. Return the encoded byte sequence.
 */
export function i32(v: number): number[] {
    if (v < MIN_I32 || v > MAX_U32) {
        throw Error("value is out of range for i32: ${v}");
    }
    if (v > MAX_I32) {
        return sleb128(v - I32_NEG_OFFSET);
    }
    return sleb128(v);
}

/**
 * Construct a WebAssembly section.
 *
 * Every WASM section has the following layout:
 *
 *   section :=
 *     section_id : byte
 *     size       : u32 (LEB128)
 *     contents   : byte[size]
 *
 * Implementation strategy:
 * 1. Flatten the contents array to determine its total byte length.
 *    Nested arrays represent structured byte sequences.
 * 2. Compute the size in bytes.
 * 3. Encode the size using u32().
 * 4. Return an array containing:
 *      [section_id, encoded_size, contents]
 *
 * The caller is responsible for ensuring contents eventually flatten
 * to raw bytes.
 */
export function section(id: number, contents: any[]) {
    const sizeInBytes = contents.flat(Infinity).length;
    return [id, u32(sizeInBytes), contents];
}

/**
 * Encode a WebAssembly vector.
 *
 * In the WASM binary format, a vector is encoded as:
 *
 *   vec(T) := length:u32  element_0 element_1 ... element_n
 *
 * Implementation steps:
 * 1. Determine the number of elements.
 * 2. Encode this count using u32().
 * 3. Return a structure representing the length prefix followed
 *    by the elements.
 *
 * Elements themselves may already be byte arrays or nested structures.
 */
export function vec(elements: string | any[]) {
    return [u32(elements.length), elements];
}

/**
 * Section ID constants from the WebAssembly binary specification.
 *
 * These numeric identifiers specify which section is being encoded.
 */
const SECTION_ID_TYPE = 0x01;
const SECTION_ID_FUNCTION = 0x03;
const SECTION_ID_EXPORT = 0x07;
const SECTION_ID_CODE = 0x0A;
/**
 * Encode a function type entry.
 *
 * WebAssembly function types are encoded as:
 *
 *   functype :=
 *     0x60
 *     vec(param_types)
 *     vec(result_types)
 *
 * Where 0x60 is the functype tag.
 *
 * Implementation:
 * 1. Emit the byte 0x60.
 * 2. Encode the parameter types using vec().
 * 3. Encode the result types using vec().
 */
export function functype(paramTypes: string | any[], resultTypes: string | any[]) {
    return [0x60, vec(paramTypes), vec(resultTypes)];
}

/**
 * Build the type section of a WebAssembly module.
 *
 * The type section stores all function signatures used in the module.
 *
 * Structure:
 *   section(
 *      SECTION_ID_TYPE,
 *      vec(functypes)
 *   )
 *
 * Each element of functypes must already be encoded using functype().
 */
export function typesec(functypes: string | any[]) {
    return section(SECTION_ID_TYPE, vec(functypes));
}

/**
 * Encode a type index (reference to an entry in the type section).
 *
 * In the WASM binary format, indices are encoded as unsigned
 * LEB128 integers.
 */
export const typeidx = (x: number) => u32(x);

/**
 * Encode a function index (reference to a function defined in
 * the module).
 *
 * Function indices are also encoded as unsigned LEB128 integers.
 */
export const funcidx = (x: number) => u32(x);

/**
 * Build the function section.
 *
 * The function section declares the type signature used by
 * each function defined in the code section.
 *
 * Structure:
 *   section(
 *     SECTION_ID_FUNCTION,
 *     vec(typeidxs)
 *   )
 *
 * Each entry is an index into the type section.
 */
export function funcsec(typeidxs: string | any[]) {
    return section(SECTION_ID_FUNCTION, vec(typeidxs));
}

/**
 * Encode a single function body entry for the code section.
 *
 * Layout in WASM:
 *
 *   code :=
 *     size:u32
 *     function_body
 *
 * The size counts only the bytes of the function body.
 *
 * Implementation:
 * 1. Flatten the function body representation to compute its length.
 * 2. Encode this size with u32().
 * 3. Return [encoded_size, func_body].
 */
export function code(func: any[]) {
    const sizeInBytes = func.flat(Infinity).length;
    return [u32(sizeInBytes), func];
}

/**
 * Construct a function body.
 *
 * WASM function bodies contain:
 *
 *   func :=
 *     vec(locals)
 *     instructions
 *
 * Locals define additional variables used by the function.
 * The instruction list must end with the `end` opcode.
 */
export function func(locals: string | any[], body: (number | any[])[]) {
    return [vec(locals), body];
}

/**
 * Build the code section containing all compiled function bodies.
 *
 * Structure:
 *   section(
 *      SECTION_ID_CODE,
 *      vec(codes)
 *   )
 *
 * Each element in `codes` must be produced using code().
 */
export function codesec(codes: string | any[]) {
    return section(SECTION_ID_CODE, vec(codes));
}

/**
 * Encode a string name into the WASM format.
 *
 * WASM strings are encoded as:
 *
 *   vec(byte)
 *
 * Where the bytes represent UTF-8 encoded characters.
 *
 * Implementation:
 * 1. Convert the string to its byte representation.
 * 2. Wrap it in vec().
 */
export function name(s: string) {
    return vec(stringToBytes(s));
}

/**
 * Encode an export entry.
 *
 * WASM export entries are encoded as:
 *
 *   export :=
 *     name
 *     exportdesc
 *
 * `name` is the exported identifier visible outside the module.
 * `exportdesc` specifies what kind of entity is exported.
 */
export function export_(nm: string, exportdesc: any[]) {
    return [name(nm), exportdesc];
}

/**
 * Construct the export section.
 *
 * Structure:
 *   section(
 *     SECTION_ID_EXPORT,
 *     vec(exports)
 *   )
 *
 * Each element must be an encoded export entry.
 */
export function exportsec(exports: string | any[]) {
    return section(SECTION_ID_EXPORT, vec(exports));
}

/**
 * Export descriptor constructors.
 *
 * Export descriptors specify what is being exported.
 *
 * Format:
 *   exportdesc :=
 *     tag
 *     index
 *
 * tag = 0x00 for functions.
 */
export const exportdesc = {
    func(idx: number) {
        return [0x00, funcidx(idx)];
    },
};

/**
 * Construct a full WebAssembly module.
 *
 * A module begins with:
 *
 *   magic   : 0x00 61 73 6d
 *   version : 0x01 00 00 00
 *   sections...
 *
 * Implementation:
 * 1. Emit the magic header.
 * 2. Emit the version number.
 * 3. Append all provided sections.
 */
export function module(sections: any[]) {
    return [magic(), version(), sections];
}

/**
 * Opcode constants for the subset of WebAssembly instructions
 * supported by this compiler.
 *
 * These correspond directly to the WASM binary opcode table.
 */

export const instr = {
    end: 0x0b,
    i32: {
        const: 0x41,
        add: 0x6a,
        sub: 0x6b,
        mul: 0x6c,
        div_s: 0x6d
    },
    local: {
        get: 0x20,
        set: 0x21
    }
};

/**
 * Value type encodings used in WebAssembly function signatures
 * and local declarations.
 */
export const valtype = {
    i32: 0x7f
};

/**
 * Encode a local variable declaration.
 *
 * WASM groups locals by type:
 *
 *   local :=
 *     count:u32
 *     value_type:byte
 *
 * Example:
 *   3 i32 locals -> [3, 0x7f]
 */
export function locals(n: number, type: number) {
    return [u32(n), type];
}

/**
 * Encode a local variable index used by instructions such as
 * `local.get` and `local.set`.
 *
 * Indices are encoded as unsigned LEB128.
 */
export const localidx = (x: number) => u32(x);



/**
 * This is not directly related to WASM, but is used by our compiler.
 * Metadata describing a symbol during compilation.
 *
 * name : identifier used in source code
 * idx  : index assigned to the variable/function in the
 *        corresponding WASM index space.
 */
export interface Info {
    name: string;
    idx: number;
}