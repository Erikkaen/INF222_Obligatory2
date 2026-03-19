grammar Zerow

entry Program:
    units+=UnitDeclaration*
    statements+=Statement*;

UnitDeclaration:
    'unit' name=ID;

Statement:
    DeclarationStmt | AssignmentStmt | ReturnStmt;

ReturnStmt:
    'returns' value=Expression;

DeclarationStmt:
    'let' name=ID '=' value=Expression;

AssignmentStmt:
    variable=[DeclarationStmt:ID] '=' value=Expression;

Expression:
    AddExpr;

AddExpr:
    left=MultExpr (operator+=('add'|'sub') right+=MultExpr)*;

MultExpr:
    left=PrimExpr (operator+=('mul'|'div') right+=PrimExpr);

PrimExpr:
    Literal
    | NegativeLiteral
    | GroupExpr
    | Reference;

Literal:
    value=INT '[' unit=[UnitDeclaration] ']';

NegativeLiteral:
    'negative' literal=Literal;

GroupExpr:
    '(' expression=Expression ')';

Reference:
    variable=[DeclarationStmt:ID];


hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
