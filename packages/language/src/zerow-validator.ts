import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { Program, ZerowAstType } from './generated/ast.js';
import type { ZerowServices } from './zerow-module.js';

import {
    isDeclarationStmt,
    isAssignmentStmt,
    isReference,
    isLiteral,
    type DeclarationStmt,
    type AssignmentStmt,
    type Expression,
    type Reference,
    type Literal,
    type Statement
} from './generated/ast.js';
/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: ZerowServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ZerowValidator;
    const checks: ValidationChecks<ZerowAstType> = {
        Program: validator.checkProgram
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class ZerowValidator {

    checkProgram(model: Program, accept: ValidationAcceptor): void {
        this.validateProgram(model, accept);
    }

    validateProgram(model: Program, accept: ValidationAcceptor) {

        const declared = new Map<string, DeclarationStmt>();

        function buildMeasureSet(expr: Expression, units: Set<string>) {
            if (isLiteral(expr)) {
                const unit = (expr as any).unit?.ref?.name;
                if (unit) units.add(unit);
                return;
            }

            if (isReference(expr)) {
                const decl = (expr as any).variable?.ref;
                if (decl) buildMeasureSet(decl.value, units);
                return;
            }

            if ((expr as any).literal) {
                buildMeasureSet((expr as any).literal, units);
            }

            if ((expr as any).expression) {
                buildMeasureSet((expr as any).expression, units);
            }

            if ((expr as any).left) {
                buildMeasureSet((expr as any).left, units);
            }

            if ((expr as any).right) {
                for (const r of (expr as any).right) {
                    buildMeasureSet(r, units);
                }
            }
        }

        function getUnit(expr: Expression): string | undefined {
            const units = new Set<string>();
            buildMeasureSet(expr, units);
            if (units.size === 1) {
                return Array.from(units)[0];
            }
            return undefined;
        }

        function validateStatement(stmt: Statement) {
            if (isDeclarationStmt(stmt)) {
                validateDeclarationStmt(stmt);
            } else if (isAssignmentStmt(stmt)) {
                validateAssignmentStmt(stmt);
            } else {
                // ReturnStmt
                const value = (stmt as any).value;
                validateExpression(value);

                const unit = getUnit(value);
                if (!unit) {
                    accept('error',
                        'Return value must have a unit.',
                        { node: stmt });
                }
            }
        }

        function validateDeclarationStmt(stmt: DeclarationStmt) {
            if (declared.has(stmt.name)) {
                accept('error',
                    `Variable '${stmt.name}' has already been declared.`,
                    { node: stmt, property: 'name' });
            } else {
                declared.set(stmt.name, stmt);
            }

            validateExpression(stmt.value);

            const unit = getUnit(stmt.value);
            if (!unit) {
                accept('error',
                    `Declaration of '${stmt.name}' must have exactly one unit.`,
                    { node: stmt });
            }
        }

        function validateAssignmentStmt(stmt: AssignmentStmt) {
            const decl = stmt.variable?.ref;

            if (!decl) return;

            if (!declared.has(decl.name)) {
                accept('error',
                    `Variable '${decl.name}' is assigned before its declaration.`,
                    { node: stmt, property: 'variable' });
                return;
            }

            validateExpression(stmt.value);

            const declUnit = getUnit(decl.value);
            const valueUnit = getUnit(stmt.value);

            if (!valueUnit) {
                accept('error',
                    `Assigned value must have a unit.`,
                    { node: stmt });
            }

            if (declUnit && valueUnit && declUnit !== valueUnit) {
                accept('error',
                    `Cannot assign '${valueUnit}' to variable '${decl.name}' of type '${declUnit}'.`,
                    { node: stmt });
            }
        }

        function validateExpression(expr: Expression) {
            const units = new Set<string>();
            buildMeasureSet(expr, units);

            if (units.size > 1) {
                accept('error',
                    `Unit mismatch: ${Array.from(units).join(' vs ')}.`,
                    { node: expr });
            }

            if (isLiteral(expr)) {
                validateLiteral(expr);
                return;
            }

            if (isReference(expr)) {
                validateReference(expr);
                return;
            }

            if ((expr as any).left) {
                validateExpression((expr as any).left);
            }

            if ((expr as any).right) {
                for (const r of (expr as any).right) {
                    validateExpression(r);
                }
            }

            if ((expr as any).expression) {
                validateExpression((expr as any).expression);
            }

            if ((expr as any).literal) {
                validateExpression((expr as any).literal);
            }
        }

        function validateLiteral(literal: Literal) {
            if (!literal.unit) {
                accept('error',
                    `Missing unit for literal.`,
                    { node: literal, property: 'unit' });
                return;
            }

            if (!literal.unit.ref) {
                accept('error',
                    `Unit '${literal.unit.$refText}' is not declared.`,
                    { node: literal, property: 'unit' });
            }
        }

        function validateReference(ref: Reference) {
            const decl = resolveReference(ref);

            if (!decl) return;

            if (!declared.has(decl.name)) {
                accept('error',
                    `Variable '${decl.name}' is referenced before its declaration.`,
                    { node: ref, property: 'variable' });
                return;
            }

            const unit = getUnit(decl.value);
            if (!unit) {
                accept('error',
                    `Referenced variable '${decl.name}' has no unit.`,
                    { node: ref });
            }
        }

        function resolveReference(ref: Reference): DeclarationStmt | undefined {
            return ref.variable?.ref;
        }

        //  checking
        if (model.statements.length === 0) {
            accept('error',
                'Program must contain at least one statement.',
                { node: model });
        }

        const hasReturn = model.statements.some(s => s.$type === 'ReturnStmt');
        if (!hasReturn) {
            accept('error',
                'Program must contain a return statement.',
                { node: model });
        }

        model.statements.forEach(validateStatement);
    }
}