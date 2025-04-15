import * as flora from "npm:@florajs/sql-parser@3.0.0";




//#region TYPES
/** Represents a generic AST node. */
type AST = Record<string, unknown>;


/** Represents a number AST node. */
interface NumberAST extends AST {
  /** Type of the AST node. */
  type: 'number';
  /** Value of the number. */
  value: number;
};


/** Represents a column reference AST node. */
interface ColumnAST extends AST {
  /** Type of the AST node. */
  type: 'column_ref';
  /** Table name (null for no table). */
  table: string | null;
  /** Column name. */
  column: string;
  /** Column alias (null for no alias). */
  as?: string;
  /** Column expression (if any). */
  expr?: unknown;
};


/** Represents a table reference AST node. */
interface TableAST extends AST {
  /** Database name (null for no database). */
  db: string | null;
  /** Table name. */
  table: string;
  /** Table alias (null for no alias). */
  as: string | null;
};


/** Represents a binary expression AST node. */
interface BinaryExprAST extends AST {
  /** Type of the AST node. */
  type: 'binary_expr';
  /** Operator used in the expression. */
  operator: string;
  /** Left operand. */
  left: unknown;
  /** Right operand. */
  right: unknown;
  /** Whether to wrap in parentheses. */
  parentheses: boolean;
};


/** Represents a SQL AST node. */
interface TopAST extends AST {
  /** Type of the AST node. */
  type: string;
  /** Columns in the SQL statement. */
  columns: Array<{expr: unknown, as: string | null}>;
  /** From clause in the SQL statement. */
  from: Array<TableAST>;
  /** Where clause in the SQL statement. */
  where?: BinaryExprAST[];
  /** Having clause in the SQL statement. */
  having?: BinaryExprAST;
  /** Order by clause in the SQL statement. */
  orderby?: Array<{expr: unknown, type: string}>;
  /** Group by clause in the SQL statement. */
  groupby?: Array<unknown>;
  /** Limit clause in the SQL statement. */
  limit?: Array<NumberAST>;
};


/**
 * Function to resolve column references in SQL statements.
 * @param txt column name or expression
 * @param type column type
 * @param hint aggregation hint (if any)
 * @param from from table names
 * @returns array of resolved column names or expressions
 */
type ResolutionFunction = (txt: string, type: string, hint: string | null, from: string) => Promise<string[]>;
//#endregion




//#region CONSTANTS
/** Match a null value. */
const NULL = /^null$/i;

/** Match a boolean value. */
const BOOL = /^(true|false)$/i;

/** Match a numeric value. */
const NUMBER = /^[\d\.\-e]$/i;

/** Match a string value. */
const STRING = /^\'[^\']\'$/;

/** Match an identifier (column name or wildcard). */
const IDENTIFIER = /^\*$|^\w+$|^\"[^\"]*\"$/;

/** Match a "all" wildcard hint. */
const HINT_ALL = /^(all|each|every):/i;

/** Match a "sum" hint. */
const HINT_SUM = /^(sum|gross|total|whole|aggregate):/i;

/** Match a "avg" hint. */
const HINT_AVG = /^(avg|mid|par|mean|norm|center|centre|average|midpoint):/i;

/** From table AST. */
const FROMT = [{table: 't', as: null}];
//#endregion




//#region FUNCTIONS
/**
 * Create a number AST node.
 * @param value numeric value
 * @returns AST node representing a number
 */
function createNumberAST(value: number): NumberAST {
  return {type: 'number', value};
}


/**
 * Create a column reference AST node.
 * @param column column name
 * @returns AST node representing a column reference
 */
function createColumnAST(column: string): ColumnAST {
  return {type: 'column_ref', table: null, column};
}


/**
 * Create a table reference AST node.
 * @param table table name
 * @param as table alias
 * @returns AST node representing a table reference
 */
function createTableAST(table: string, as: string | null=null): TableAST {
  return {db: null, table, as};
}


/**
 * Create a binary expression AST node.
 * @param operator operator used in expression
 * @param left left operand
 * @param right right operand
 * @param parentheses whether to wrap in parentheses
 * @returns AST node representing a binary expression
 */
function createBinaryExprAST(operator: string, left: unknown, right: unknown, parentheses=false): BinaryExprAST {
  return {type: 'binary_expr', operator, left, right, parentheses};
}


/**
 * Remove quotes from quoted identifiers.
 * @param txt text to dequote
 * @returns dequoted text
 */
function dequoteIdentifier(txt: string): string {
  return /^[\'\"]/.test(txt)? txt.slice(1, -1) : txt;
}


/**
 * Clear SQL comments and trailing semicolons.
 * @param txt SQL text to clear
 * @returns cleared SQL text
 */
function clearSQLComments(txt: string) {
  txt = txt.replace(/\/\*.*?\*\//gm, '');
  txt = txt.replace(/\-\-.*/g, '').trim();
  return txt.endsWith(';')? txt.slice(0, -1) : txt;
}


/**
 * Set query limit in AST.
 * @param ast AST to modify (updated!)
 * @param max maximum limit value
 */
function setLimitAST(ast: TopAST, max: number) {
  const value = Math.min(ast.limit? (ast.limit[1]).value : max, max);
  ast.limit = [{type: 'number', value}];
}


/**
 * Create sum-aggregate expression from columns.
 * @param cols columns to sum
 * @returns array of AST nodes representing the sum expression
 */
function createSumExprAST(cols: ColumnAST[]): unknown[] {
  if (cols.length===0) return [createNumberAST(0)];
  if (cols.length===1) return [cols[0]];
  const ast = createBinaryExprAST('+', cols[0], cols[1], true);
  for (let i=2, I=cols.length; i<I; i++)
    ast.right = createBinaryExprAST('+', ast.right, cols[i]);
  return [ast];
}


/**
 * Create average-aggregate expression from columns.
 * @param cols columns to average
 * @returns array of AST nodes representing the average expression
 */
function createAvgExprAST(cols: ColumnAST[]): unknown[] {
  if (cols.length===0) return [createNumberAST(0)];
  const ast = createBinaryExprAST('/', createSumExprAST(cols)[0], createNumberAST(cols.length), true);
  return [ast];
}


/**
 * Parse SQL expression into AST.
 * @param expr expression to parse
 * @returns AST node representing the parsed expression
 */
function parseExprAST(expr: string): unknown {
  expr = expr.replace(/<>/g, '!=').replace(/@@/g, '<>');
  const txt = `SELECT * FROM T WHERE (${expr})`;
  const ast = new flora.Parser().parse(txt);
  return ast.where;
}


/**
 * Parse value into appropriate AST node.
 * @param val value to parse
 * @returns AST node representing the parsed value
 */
function parseValueAST(val: string): unknown {
  if (NULL.test(val))       return {type: 'null',   value: null};
  if (BOOL.test(val))       return {type: 'bool',   value: /true/i.test(val)};
  if (NUMBER.test(val))     return {type: 'number', value: parseFloat(val)};
  if (STRING.test(val))     return {type: 'string', value: val.slice(1, -1)};
  if (IDENTIFIER.test(val)) return createColumnAST(dequoteIdentifier(val));
  return parseExprAST(val);
}


/**
 * Resolve column, with possible aggregation hints.
 * @param type column type
 * @param from from table names
 * @param txt column name or expression
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 * @returns AST representing the resolved column
 */
async function resolveColumnAST(type: string, from: string, txt: string, fn: ResolutionFunction, ths: unknown=null): Promise<unknown[]> {
  let hint: string | null = null;
  if (HINT_ALL.test(txt)) hint = 'all';
  else if (HINT_SUM.test(txt)) hint = 'sum';
  else if (HINT_AVG.test(txt)) hint = 'avg';
  const ans = await fn.call(ths, hint? txt.replace(/.*?:/, '') : txt, type, hint, from);
  const ast = (ans||[]).map((val: string) => parseValueAST(val));
  if (hint==null || hint==='all') return ast;
  return hint==='sum'? createSumExprAST(ast as ColumnAST[]) : createAvgExprAST(ast as ColumnAST[]);
}


/**
 * Recursively process subexpressions in AST.
 * @param type column type
 * @param from from table names
 * @param ast AST to process (updated!)
 * @param k key in AST to process
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 * @returns promise when done
 */
function processSubexprAST(type: string, from: string, ast: AST, k: string, fn: ResolutionFunction, ths: unknown=null): unknown {
  if (ast[k]==null || typeof ast[k]!=='object') return Promise.resolve();
  if ((ast[k] as ColumnAST).type==='column_ref') return resolveColumnAST(type, from, (ast[k] as ColumnAST).column, fn, ths).then(ans => ast[k] = ans[0]);
  return Promise.all(Object.keys(ast[k]).map(l => processSubexprAST(type, from, ast[k] as AST, l, fn, ths)));
}


/**
 * Process expression in AST.
 * @param type column type
 * @param from from table names
 * @param ast AST to process
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 * @returns processed AST (promise)
 */
function processExprAST(type: string, from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null): unknown {
  if (ast.type==='column_ref') return resolveColumnAST(type, from, ast.column as string, fn, ths);
  return Promise.all(Object.keys(ast).map(k => processSubexprAST(type, from, ast, k, fn, ths))).then(() => [ast]);
}


/**
 * Convert AST expression back to SQL string.
 * @param expr expression AST node
 * @returns SQL string representation of the expression
 */
function stringifyExprAST(expr: unknown): string {
  const sql = flora.util.astToSQL({type: 'select', from: FROMT, columns: [{expr, as: null}]});
  return sql.substring(7, sql.length-9).replace(/([\'\"])/g, '$1$1');
}


/**
 * Format column name with optional alias.
 * @param col column name
 * @param len number of expressions
 * @param as preferred alias
 * @returns formatted column name with alias
 */
function formatColumnFormalize(col: string, len: number, as: string | null): string | null {
  return len>1 && as!=null? as + ': ' + col : as;
}


/**
 * Tweak columns in AST, resolving references and applying aliases.
 * @param from from table names
 * @param ast AST to process (updated!)
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 */
async function tweakColumnsAST(from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  const columns = ast.columns as ColumnAST[], to: unknown[] = [];
  const ans = await Promise.all(columns.map(col => processExprAST('columns', from, col.expr as AST, fn, ths)));
  for (let i=0, I=columns.length; i<I; i++) {
    const col  = columns[i] as ColumnAST;
    const exps = ans[i]     as ColumnAST[];
    for (const exp of exps) {
      if (exp.type!=='column_ref') to.push({expr: exp, as: col.as==null? stringifyExprAST(exp) : col.as});
      else to.push({expr: exp, as: formatColumnFormalize(exp.column, exps.length, col.as as string)});
    }
  }
  ast.columns = to;
}


/**
 * Tweak WHERE clause in AST, resolving references and applying aliases.
 * @param from from table names
 * @param ast AST to process (updated!)
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 */
async function tweakWhereAST(from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  await processSubexprAST('where', from, ast, 'where', fn, ths);
}


/**
 * Tweak HAVING clause in AST, resolving references and applying aliases.
 * @param from from table names
 * @param ast AST to process (updated!)
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 */
async function tweakHavingAST(from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  await processSubexprAST('having', from, ast, 'having', fn, ths);
}


/**
 * Tweak ORDER BY clause in AST, resolving references and applying aliases.
 * @param from from table names
 * @param ast AST to process (updated!)
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 */
async function tweakOrderByAST(from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  const orderby = ast.orderby as AST[], to: unknown[] = [];
  const ans = await Promise.all(orderby.map(col => processExprAST('orderBy', from, col.expr as AST, fn, ths)));
  for (let i=0, I=orderby.length; i<I; i++) {
    const col = orderby[i], exps = ans[i] as ColumnAST[];
    for (const exp of exps)
      to.push({expr: exp, type: col.type});
  }
  ast.orderby = to;
}


/**
 * Tweak GROUP BY clause in AST, resolving references and applying aliases.
 * @param _from from table names
 * @param ast AST to process (updated!)
 * @param fn column resolution function `fn(txt, type, hint, from)`
 * @param ths this argument
 */
async function tweakGroupByAST(_from: string, ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  const groupby = ast.groupby as ColumnAST[], to: AST[] = [];
  const ans = await Promise.all(groupby.map(exp => processExprAST('groupBy', "", exp as AST, fn, ths)));
  for (const val of ans)
    to.push.apply(to, val as AST[]);
  ast.groupby = to
}


/**
 * Fork WHERE clause in AST, creating a new one if it doesn't exist.
 * @param ast AST to process (updated!)
 * @returns AST with a new WHERE clause
 */
function forkWhereAST(ast: TopAST) {
  const txt = `SELECT * FROM T WHERE TRUE AND TRUE`;
  const asw = new flora.Parser().parse(txt);
  if (ast.where) {
    asw.where.left = ast.where;
    ast.where = asw.where;
    ((ast.where as unknown as BinaryExprAST).left as AST).parentheses = true;
  }
  else ast.where = asw.where;
  return ast;
}


/**
 * Append a WHERE clause to the AST.
 * @param ast AST to process (updated!)
 * @param expr expression to append
 * @returns AST with the appended WHERE clause
 */
function appendWhereAST(ast: TopAST, expr: string) {
  expr = expr.replace(/<>/g, '!=').replace(/@@/g, '<>');
  const txt = `SELECT * FROM T WHERE FALSE OR (${expr})`;
  const asw = new flora.Parser().parse(txt);
  const opr = asw.where.right.operator.replace(/<>/, '@@');
  asw.where.right.operator = opr;
  if (((ast.where as unknown as AST).right as AST).value===true) {
    (ast.where as unknown as AST).right = asw.where;
    ((ast.where as unknown as AST).right as AST).parentheses = true;
  }
  else {
    asw.where.left = ((ast.where as unknown as AST).right as AST).right;
    ((ast.where as unknown as AST).right as AST).right = asw.where;
  }
  return ast;
}


/**
 * Scan the FROM clause in AST, resolving references and WHERE clauses.
 * @param ast AST to scan
 * @param fn function to resolve references `fn(table, type, hint, from)`
 * @param ths this argument for the function
 * @returns object with resolved references and WHERE clauses
 */
async function scanFromAST(ast: AST, fn: ResolutionFunction, ths: unknown=null) {
  const from = ast.from as TableAST[], to = new Set(), where: AST[] = [];
  const ans = await Promise.all(from.map((b: TableAST) => fn.call(ths, b.table, 'from', null, '') || []));
  for (const vals of ans) {
    for (const v of vals) {
      if (IDENTIFIER.test(v)) to.add(dequoteIdentifier(v));
      else where.push(v as unknown as AST);
    }
  }
  return {from: Array.from(to), where};
}


/**
 * Tweak the FROM clause in AST, creating a new one if it doesn't exist.
 * @param ast AST to process (updated!)
 * @param scn object with resolved references and WHERE clauses
 */
function tweakFromAST(ast: AST, scn: TopAST) {
  ast = forkWhereAST(ast as TopAST);
  for (const val of scn.where || [])
    appendWhereAST(ast as TopAST, val as unknown as string);
  ast.from = (scn.from as unknown as string[]).map((v: string) => createTableAST(v));
}


/**
 * Convert informal SQL SELECT statements into formal SQL.
 * @param txt SQL text to convert
 * @param fn function to resolve references `fn(table, type, hint, from)`
 * @param ths this argument for the function
 * @param opt options for the conversion
 * @returns converted SQL string (promise)
 */
export async function convertToFormalSQL(txt: string, fn: ResolutionFunction, ths: unknown=null, opt: Record<string, unknown>={}): Promise<string> {
  const ast  = new flora.Parser().parse(clearSQLComments(txt)), rdy: Promise<unknown>[] = [];
  if (ast.type!=='select') throw new Error(`Only SELECT supported <<${txt}>>.`);
  const scn  = await scanFromAST(ast, fn, ths);
  const from = scn.from as AST[];
  if (from.length === 0 && opt.from != null) from.push(opt.from as AST);
  if (typeof ast.columns !== 'string') rdy.push(tweakColumnsAST(from as unknown as string, ast, fn, ths));
  if (ast.where != null)   rdy.push(tweakWhereAST(from as unknown as string, ast, fn, ths));
  if (ast.having != null)  rdy.push(tweakHavingAST(from as unknown as string, ast, fn, ths));
  if (ast.orderby != null) rdy.push(tweakOrderByAST(from as unknown as string, ast, fn, ths));
  if (ast.groupby != null) rdy.push(tweakGroupByAST(from as unknown as string, ast, fn, ths));
  await Promise.all(rdy);
  tweakFromAST(ast, scn as TopAST);
  if (ast.from.length === 0) ast.from.push(createTableAST('null'));
  const lim = opt.limits? (opt.limits as Record<string, number>)[ast.from[0].table] || 0 : (opt.limit as number) || 0;
  if (lim) setLimitAST(ast, lim);
  return flora.util.astToSQL(ast);
}
//#endregion
