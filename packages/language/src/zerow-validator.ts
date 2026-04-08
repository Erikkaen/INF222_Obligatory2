import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    AddExpr,
    AssignmentStmt,
    DeclarationStmt,
    Expression,
    Literal,
    Program,
    Reference,
    ZerowAstType
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
         const declaredVariables = new Map<string, DeclarationStmt>();
         const variableUnits = new Map<string, string | undefined>();

         function buildMeasureSet(expr: Expression | undefined): string | undefined {
             if (!expr) {
                 return undefined;
             }
             return validateExpression(expr);
         }

         function validateStatement(stmt: DeclarationStmt | AssignmentStmt) {
             if (stmt.$type === 'DeclarationStmt') {
                 validateDeclarationStmt(stmt);
             } else if (stmt.$type === 'AssignmentStmt') {
                 validateAssignmentStmt(stmt);
             }
         }

         function validateDeclarationStmt(stmt: DeclarationStmt): void {
             if (declaredVariables.has(stmt.name)) {
                 accept('error', `Variable '${stmt.name}' has already been declared.`, {
                     node: stmt,
                     property: 'name'
                 });
                 return;
             }
             declaredVariables.set(stmt.name, stmt);

             const unit = validateExpression(stmt.value);
             variableUnits.set(stmt.name, unit);
         }

         function validateAssignmentStmt(stmt: AssignmentStmt) {
             const variable = stmt.variable.ref;

             if (variable && !declaredVariables.has(variable.name)) {
                 accept('error', `Variable '${variable.name}' is assigned before it is declared.`, {
                     node: stmt,
                     property: 'variable'
                 });
                 return;
             }

             const assignedUnit = validateExpression(stmt.value);

             // Assignments are allowed to change the variable's unit - one of my problems on the tests
             if (variable && assignedUnit !== undefined) {
                 variableUnits.set(variable.name, assignedUnit);
             }
         }

         function validateExpression(expr: Expression): string | undefined {
             const addExpr = expr as AddExpr;

             if (addExpr.left !== undefined && addExpr.right !== undefined) {
                 const leftUnit = resolveReference(addExpr.left);

                 const rights = Array.isArray(addExpr.right)
                     ? addExpr.right
                     : [addExpr.right];

                 for (const right of rights) {
                     const rightUnit = resolveReference(right);

                     if (
                         leftUnit !== undefined &&
                         rightUnit !== undefined &&
                         leftUnit !== rightUnit
                     ) {
                         accept('error',
                             `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`,
                             { node: expr as any }
                         );
                     }
                 }

                 return leftUnit;
             }

             return resolveReference(expr);
         }

         function validateLiteral(literal: Literal): string | undefined {
             if (!literal.unit || !literal.unit.ref) {
                 accept('error', 'Missing unit.', {
                     node: literal as any
                 });
                 return undefined;
             }

             return literal.unit.ref.name;
         }

         function validateReference(ref: Reference): string | undefined {
             const variable = ref.variable.ref;

             if (!variable) {
                 return undefined;
             }

             if (!declaredVariables.has(variable.name)) {
                 accept('error', `Variable '${variable.name}' is used before it is declared.`, {
                     node: ref,
                     property: 'variable'
                 });
                 return undefined;
             }

             return variableUnits.get(variable.name);
         }


         function resolveReference(expr: any): string | undefined {
             if (!expr) {
                 return undefined;
             }

             switch (expr.$type) {
                 case 'Literal':
                     return validateLiteral(expr);

                 case 'NegativeLiteral':
                     return validateLiteral(expr.value);

                 case 'Reference':
                     return validateReference(expr);

                 case 'GroupExpr':
                     return resolveReference(expr.expression);

                 case 'MultExpr': {
                     const leftUnit = resolveReference(expr.left);

                     const rights = Array.isArray(expr.right)
                         ? expr.right
                         : [expr.right];

                     for (const right of rights) {
                         const rightUnit = resolveReference(right);

                         if (
                             leftUnit !== undefined &&
                             rightUnit !== undefined &&
                             leftUnit !== rightUnit
                         ) {
                             accept('error',
                                 `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`,
                                 { node: expr as any }
                             );
                         }
                     }

                     return leftUnit;
                 }

                 case 'AddExpr': {
                     const leftUnit = resolveReference(expr.left);

                     const rights = Array.isArray(expr.right)
                         ? expr.right
                         : [expr.right];

                     for (const right of rights) {
                         const rightUnit = resolveReference(right);

                         if (
                             leftUnit !== undefined &&
                             rightUnit !== undefined &&
                             leftUnit !== rightUnit
                         ) {
                             accept('error',
                                 `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`,
                                 { node: expr as any }
                             );
                         }
                     }

                     return leftUnit;
                 }

                 default:
                     return undefined;
             }
         }

         for (const stmt of model.body) {
             validateStatement(stmt);
         }

         for (const ret of model.returns) {
             buildMeasureSet(ret.value);
         }
     }
}