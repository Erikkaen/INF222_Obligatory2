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

         function validateDeclarationStmt(stmt: DeclarationStmt) {
             if (declaredVariables.has(stmt.name)) {
                 accept('error', `Variable '${stmt.name}' has already been declared.`, {
                     node: stmt,
                     property: 'name'
                 });
             } else {
                 declaredVariables.set(stmt.name, stmt);
             }

             validateExpression(stmt.value);
         }

         function validateAssignmentStmt(stmt: AssignmentStmt) {
             const variable = stmt.variable.ref;

            //No duplicates here
             if (variable && !declaredVariables.has(variable.name)) {
                 accept('error', `Variable '${variable.name}' is assigned before it is declared.`, {
                     node: stmt,
                     property: 'variable'
                 });
             }

             validateExpression(stmt.value);
         }

         function validateExpression(expr: Expression): string | undefined {
             const addExpr = expr as AddExpr;

             if (addExpr.left !== undefined && addExpr.right !== undefined) {
                 let leftUnit = resolveReference(addExpr.left);

                 const rights = Array.isArray(addExpr.right) ? addExpr.right : [addExpr.right];

                 for (const right of rights) {
                     const rightUnit = resolveReference(right);

                     if (
                         leftUnit !== undefined &&
                         rightUnit !== undefined &&
                         leftUnit !== rightUnit
                     ) {
                         accept('error', `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`, {
                             node: expr
                         });
                     }

                     leftUnit = rightUnit;
                 }
             }

             return resolveReference(expr);
         }

         function validateLiteral(literal: Literal): string | undefined {
             return literal.unit.ref?.name;
         }

         function validateReference(ref: Reference): string | undefined {
             const variable = ref.variable.ref;

             // Unresolved variable here, return undefined
             if (!variable) {
                 return undefined;
             }

             if (!declaredVariables.has(variable.name)) {
                 accept('error', `Variable '${variable.name}' is used before it is declared.`, {
                     node: ref,
                     property: 'variable'
                 });
             }

             return resolveReference(variable.value);
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
                     let leftUnit = resolveReference(expr.left);

                     for (const right of expr.right) {
                         const rightUnit = resolveReference(right);

                         if (
                             leftUnit !== undefined &&
                             rightUnit !== undefined &&
                             leftUnit !== rightUnit
                         ) {
                             accept('error', `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`, {
                                 node: expr
                             });
                         }

                         leftUnit = rightUnit;
                     }

                     return leftUnit;
                 }

                 case 'AddExpr': {
                     let leftUnit = resolveReference(expr.left);

                     for (const right of expr.right) {
                         const rightUnit = resolveReference(right);

                         if (
                             leftUnit !== undefined &&
                             rightUnit !== undefined &&
                             leftUnit !== rightUnit
                         ) {
                             accept('error', `Type mismatch: '${leftUnit}' is not compatible with '${rightUnit}'.`, {
                                 node: expr
                             });
                         }
                         leftUnit = rightUnit;
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