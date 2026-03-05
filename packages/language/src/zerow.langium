grammar Zerow

entry Program:
    statements+=Statement*;

Statement:
    DeclarationStmt | AssignmentStmt;

DeclarationStmt:
    'let' name=ID '=' expr=Expression ';';

AssignmentStmt:
    variable=[DeclarationStmt:ID] '=' expr=Expression ';';

Expression:
    Literal | Reference;

Literal:
    value=INT;

Reference:
    variable=[DeclarationStmt:ID];


hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
