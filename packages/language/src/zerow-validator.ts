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

        function validateStatement(stmt: Statement) {
            if (isDeclarationStmt(stmt)) {
                validateDeclarationStmt(stmt);
            } else if (isAssignmentStmt(stmt)) {
                validateAssignmentStmt(stmt);
            } else {
                validateExpression((stmt as any).value);
            }
        }

        function validateDeclarationStmt(stmt: DeclarationStmt) {
            if (declared.has(stmt.name)) {
                accept('error',
                    `Variable '${stmt.name}' has already been declared.`,
                    {node: stmt, property: 'name'});
            } else {
                declared.set(stmt.name, stmt);
            }

            validateExpression(stmt.value);
        }

        function validateAssignmentStmt(stmt: AssignmentStmt) {
            const decl = stmt.variable?.ref;

            if (!decl) return;

            if (!declared.has(decl.name)) {
                accept('error',
                    `Variable '${decl.name}' is assigned before its declaration.`,
                    {node: stmt, property: 'variable'});
            }

            validateExpression(stmt.value);
        }

        function validateExpression(expr: Expression) {

            const units = new Set<string>();
            buildMeasureSet(expr, units);

            if (units.size > 1) {
                accept('error',
                    `Unit mismatch.`,
                    {node: expr});
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
                    `Missing unit.`,
                    {node: literal, property: 'unit'});
                return;
            }

            if (!literal.unit.ref) {
                accept('error',
                    `Undeclared unit.`,
                    {node: literal, property: 'unit'});
            }
        }

        function validateReference(ref: Reference) {
            const decl = resolveReference(ref);

            if (!decl) return;

            if (!declared.has(decl.name)) {
                accept('error',
                    `Variable '${decl.name}' is referenced before its declaration.`,
                    { node: ref, property: 'variable' });
            }
        }

        function resolveReference(ref: Reference): DeclarationStmt | undefined {
            return ref.variable?.ref;
        }

        model.statements.forEach(validateStatement);
    }


}