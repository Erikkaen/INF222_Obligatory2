import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    Program,
    ZerowAstType,
    Statement,
    DeclarationStmt,
    AssignmentStmt,
    Expression,
    AddExpr,
    MultExpr,
    Literal,
    Reference
} from './generated/ast.js';
import type { ZerowServices } from './zerow-module.js';



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

        const unitSet = buildMeasureSet(model.units);
        const symbolTable = new Map<string, string>();

        for (const stmt of model.statements) {
            validateStatement(stmt);
        }

        function buildMeasureSet(units: Program['units']) {
            const set = new Set<string>();

            for (const unit of units) {
                if (set.has(unit.name)) {
                    accept('error', `Duplicate unit '${unit.name}'`, { node: unit });
                }
                set.add(unit.name);
            }

            return set;
        }

        function validateStatement(stmt: Statement) {
            if (stmt.$type === 'DeclarationStmt') {
                validateDeclarationStmt(stmt);
            } else if (stmt.$type === 'AssignmentStmt') {
                validateAssignmentStmt(stmt);
            } else if (stmt.$type === 'ReturnStmt') {
                validateExpression(stmt.value);
            }
        }

        function validateDeclarationStmt(stmt: DeclarationStmt) {
            if (symbolTable.has(stmt.name)) {
                accept('error', `Variable '${stmt.name}' already declared`, { node: stmt });
                return;
            }

            const unit = validateExpression(stmt.value);
            if (unit) {
                symbolTable.set(stmt.name, unit);
            }
        }

        function validateAssignmentStmt(stmt: AssignmentStmt) {
            const variable = stmt.variable.ref;

            if (!variable) {
                accept('error', `Unresolved variable`, { node: stmt });
                return;
            }

            const name = variable.name;

            if (!symbolTable.has(name)) {
                accept('error', `Variable '${name}' not declared`, { node: stmt });
                return;
            }

            const expectedUnit = symbolTable.get(name);
            const actualUnit = validateExpression(stmt.value);

            if (expectedUnit && actualUnit && expectedUnit !== actualUnit) {
                accept(
                    'error',
                    `Unit mismatch: cannot assign '${actualUnit}' to '${expectedUnit}'`,
                    { node: stmt }
                );
            }
        }

        function validateExpression(expr: Expression): string | undefined {
            return validateAddExpr(expr as AddExpr);
        }

        function validateAddExpr(expr: AddExpr): string | undefined {
            let currentUnit = validateMultExpr(expr.left);

            for (let i = 0; i < expr.right.length; i++) {
                const rightUnit = validateMultExpr(expr.right[i]);

                if (currentUnit && rightUnit && currentUnit !== rightUnit) {
                    accept(
                        'error',
                        `Unit mismatch in '${expr.operator[i]}' operation: '${currentUnit}' vs '${rightUnit}'`,
                        { node: expr }
                    );
                }
            }

            return currentUnit;
        }

        function validateMultExpr(expr: MultExpr): string | undefined {
            let currentUnit = validatePrim(expr.left);

            for (let i = 0; i < expr.right.length; i++) {
                const rightUnit = validatePrim(expr.right[i]);

                if (currentUnit && rightUnit && currentUnit !== rightUnit) {
                    accept(
                        'error',
                        `Unit mismatch in '${expr.operator[i]}' operation: '${currentUnit}' vs '${rightUnit}'`,
                        { node: expr }
                    );
                }
            }

            return currentUnit;
        }

        function validatePrim(expr: any): string | undefined {
            if (expr.$type === 'Literal') {
                return validateLiteral(expr);
            }
            if (expr.$type === 'Reference') {
                return validateReference(expr);
            }
            if (expr.$type === 'GroupExpr') {
                return validateExpression(expr.expression);
            }
            if (expr.$type === 'NegativeLiteral') {
                return validateLiteral(expr.literal);
            }
            return undefined;
        }

        function validateLiteral(lit: Literal): string | undefined {
            const unit = lit.unit.ref;

            if (!unit) {
                accept('error', `Unknown unit`, { node: lit });
                return undefined;
            }

            if (!unitSet.has(unit.name)) {
                accept('error', `Unit '${unit.name}' is not declared`, { node: lit });
            }

            return unit.name;
        }

        function validateReference(ref: Reference): string | undefined {
            const decl = resolveReference(ref);

            if (!decl) {
                accept('error', `Unresolved reference`, { node: ref });
                return undefined;
            }

            const name = decl.name;

            if (!symbolTable.has(name)) {
                accept('error', `Variable '${name}' used before declaration`, { node: ref });
                return undefined;
            }

            return symbolTable.get(name);
        }

        function resolveReference(ref: Reference) {
            return ref.variable.ref;
        }
    }
}