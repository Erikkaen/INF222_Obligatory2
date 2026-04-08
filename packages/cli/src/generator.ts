import type {AddExpr, Expression, Literal, MultExpr, NegativeLiteral, Program, Reference} from 'zerow-language';
import * as fs from 'node:fs';
import {
    code,
    codesec,
    export_, exportdesc,
    exportsec,
    extractDestinationAndName, func,
    funcsec,
    functype, i32,
    Info,
    instr, localidx, locals,
    module,
    typeidx,
    typesec,
    valtype
} from './util.js';

export function generateOutput(model: Program, source: string, destination: string): string {
    const data = extractDestinationAndName(destination);

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }

    fs.writeFileSync(destination, compile(model));
    return destination;
}

export function compile(model: Program) {
    const program = generateProgram(model);

    const resultTypes = model.returns.map(() => valtype.i32);

    const wasmModule = module([
        typesec([
            functype([], resultTypes)
        ]),
        funcsec([
            typeidx(0)
        ]),
        exportsec([
            export_('main', exportdesc.func(0))
        ]),
        codesec([
            code(program)
        ])
    ]);

    return Uint8Array.from(wasmModule.flat(Infinity));
}

function generateProgram(model: Program) {
    const symbols: Map<string, Info> = new Map();
    const body: any[] = [];

    let nextLocal = 0;

    const statements = model.body;
    const returns = model.returns;

    for (const stmt of statements) {
        if (stmt.$type === 'DeclarationStmt') {
            symbols.set(stmt.name, {
                name: stmt.name,
                idx: nextLocal
            });

            body.push(...generateExpression(stmt.value, symbols));
            body.push(instr.local.set, localidx(nextLocal));
            nextLocal++;
        }

        if (stmt.$type === 'AssignmentStmt') {
            const ref = stmt.variable.ref;
            if (!ref) {
                continue;
            }

            const info = symbols.get(ref.name);
            if (!info) {
                continue;
            }

            body.push(...generateExpression(stmt.value, symbols));
            body.push(instr.local.set, localidx(info.idx));
        }
    }

    for (const ret of returns) {
        body.push(...generateExpression(ret.value, symbols));
    }

    body.push(instr.end);

    const localDecls = nextLocal > 0
        ? [locals(nextLocal, valtype.i32)]
        : [];

    return func(localDecls, body);
}

function generateExpression(expr: Expression | any, symbols: Map<string, Info>): any[] {
    switch (expr.$type) {
        case 'Literal':
            return generateLiteral(expr);

        case 'NegativeLiteral':
            return generateNegativeLiteral(expr);

        case 'Reference':
            return generateReference(expr, symbols);

        case 'GroupExpr':
            return generateExpression(expr.expression, symbols);

        case 'AddExpr':
            return generateAddExpr(expr, symbols);

        case 'MultExpr':
            return generateMultExpr(expr, symbols);

        default:
            return [];
    }
}

function generateLiteral(expr: Literal): any[] {
    return [instr.i32.const, i32(expr.value)];
}

function generateNegativeLiteral(expr: NegativeLiteral): any[] {
    return [instr.i32.const, i32(-expr.value.value)];
}

function generateReference(expr: Reference, symbols: Map<string, Info>): any[] {
    const ref = expr.variable.ref;
    if (!ref) {
        return [];
    }

    const info = symbols.get(ref.name);
    if (!info) {
        return [];
    }

    return [instr.local.get, localidx(info.idx)];
}

function generateAddExpr(expr: AddExpr, symbols: Map<string, Info>): any[] {
    const result = [...generateExpression(expr.left, symbols)];

    const rights = Array.isArray(expr.right) ? expr.right : [expr.right];
    const operators = Array.isArray(expr.operator) ? expr.operator : [expr.operator];

    for (let i = 0; i < rights.length; i++) {
        result.push(...generateExpression(rights[i], symbols));

        if (operators[i] === 'add') {
            result.push(instr.i32.add);
        } else {
            result.push(instr.i32.sub);
        }
    }

    return result;
}

function generateMultExpr(expr: MultExpr, symbols: Map<string, Info>): any[] {
    const result = [...generateExpression(expr.left, symbols)];

    const rights = Array.isArray(expr.right) ? expr.right : [expr.right];
    const operators = Array.isArray(expr.operator) ? expr.operator : [expr.operator];

    for (let i = 0; i < rights.length; i++) {
        result.push(...generateExpression(rights[i], symbols));

        if (operators[i] === 'mul') {
            result.push(instr.i32.mul);
        } else {
            result.push(instr.i32.div_s);
        }
    }

    return result;
}
