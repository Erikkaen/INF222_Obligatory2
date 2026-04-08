grammar Zerow

entry Program:
    units+=UnitDeclaration*
    body+=VarStmt*
    returns+=ReturnStmt*;

UnitDeclaration:
    'unit' name=ID;

VarStmt:
    DeclarationStmt | AssignmentStmt;

DeclarationStmt:
    'declare' name=ID 'equals' value=Expression;

AssignmentStmt:
    'assign' value=Expression 'to' variable=[DeclarationStmt:ID];

ReturnStmt:
    'returns' value=Expression;

Expression:
    AddExpr;

AddExpr infers Expression:
    MultExpr ({infer AddExpr.left=current} operator=('add' | 'sub') right=MultExpr)*;

MultExpr infers Expression:
    PrimaryExpr ({infer MultExpr.left=current} operator=('mul' | 'div') right=PrimaryExpr)*;

PrimaryExpr infers Expression:
      Literal
    | NegativeLiteral
    | Reference
    | GroupExpr;

Literal:
    value=INT '[' unit=[UnitDeclaration:ID] ']';

NegativeLiteral:
    'neg' value=Literal;

Reference:
    variable=[DeclarationStmt:ID];

GroupExpr:
    '(' expression=Expression ')';


hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
