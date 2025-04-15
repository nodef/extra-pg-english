import {TokenType as T, type Token, createToken, parseTokens} from "./token.ts";
import {processEntityTokens, type EntityTestFunction} from "./entity.ts";
import {processNumberTokens}   from "./number.ts";
import {processUnitTokens}     from "./unit.ts";
import {processReservedTokens} from "./reserved.ts";




//#region TYPES
/**
 * Function to process the matched tokens in a substage.
 * @param state current state of the parser
 * @param tokens list of tokens to process
 * @param index index of the current token in the list
 */
type InformalizeSubstageFunction = (state: InformalizeState, tokens: Token[], index: number) => Token | Token[] | null;


/** Represents a processing substage in the pipeline. */
interface InformalizeSubstage {
  /** Type of the stage. */
  t: T[];
  /** Value pattern to match. */
  v: (RegExp | null)[];
  /** Function to process the matched tokens. */
  f: InformalizeSubstageFunction;
};


/** Represents the state of the Informalizer. */
interface InformalizeState {
  /** Columns to be selected. */
  columns: string[];
  /** Table names to be selected from. */
  from: string[];
  /** Columns to be grouped by. */
  groupBy: string[];
  /** Columns to be ordered by. */
  orderBy: string[];
  /** Condition for the WHERE clause. */
  where: string;
  /** Condition for the HAVING clause. */
  having: string;
  /** Limit for the number of rows. */
  limit: number;
  /** Columns used in the query. */
  columnsUsed: string[];
  /** Reverse order for the ORDER BY clause. */
  reverse: boolean;
  /** Hints for the query. */
  hints: Set<string>;
};


/** Optional parameters for informalize processing, including table name and column hints. */
interface InformalizeOptions {
  /** Table name for the query. */
  table?: string;
  /** Column hints for the query. */
  columns?: Record<string, Iterable<string>>;
};
//#endregion




//#region CONSTANTS
/** Rules for handling NULL ordering related tokens. */
const NULLORDER: InformalizeSubstage[] = [
  {t: [T.KEYWORD, T.KEYWORD, T.ORDINAL], v: [/SELECT/, /NULL/, /1/],           f: (_s, _t, _i) => createToken(T.KEYWORD, 'NULLS FIRST')},
  {t: [T.KEYWORD, T.KEYWORD, T.TEXT],    v: [/SELECT/, /NULL/, /last|first/i], f: (_s,  t,  i) => createToken(T.KEYWORD, `NULLS ${(t[i+2].value as string).toUpperCase()}`)},
];


/** Rules for processing number-related tokens. */
const NUMBER: InformalizeSubstage[] = [
  {t: [T.CARDINAL, T.ORDINAL], v: [null, null], f: (_s, t, i) => createToken(T.CARDINAL, (t[i].value as number)/(t[i+1].value as number))},
  {t: [T.CARDINAL, T.UNIT],    v: [null, null], f: (_s, t, i) => createToken(T.CARDINAL, (t[i].value as number)*(t[i+1].value as number))},
];


/** Rules for processing LIMIT clauses. */
const LIMIT: InformalizeSubstage[] = [
  {t: [T.KEYWORD, T.NUMBER], v: [/ASC|LIMIT/, null],     f: (s, t, i) => { s.limit = t[i+1].value as number; return null; }},
  {t: [T.NUMBER, T.KEYWORD], v: [null, /ASC|LIMIT/],     f: (s, t, i) => { s.limit = t[i].value as number; return null; }},
  {t: [T.KEYWORD, T.NUMBER], v: [/(DESC )?LIMIT/, null], f: (s, t, i) => { s.limit = t[i+1].value as number; s.reverse = !s.reverse; return null; }},
  {t: [T.NUMBER, T.KEYWORD], v: [null, /(DESC )?LIMIT/], f: (s, t, i) => { s.limit = t[i].value as number; s.reverse = !s.reverse; return null; }},
];


/** Rules for processing values. */
const VALUE: InformalizeSubstage[] = [
  {t: [T.OPERATOR, T.KEYWORD, T.COLUMN], v: [/ALL/, /TYPE/, null], f: (_s, t, i) => createToken(T.COLUMN, `all: ${t[i+2].value}`)},
  {t: [T.OPERATOR, T.KEYWORD, T.COLUMN], v: [/\+/, /TYPE/, null],  f: (_s, t, i) => createToken(T.COLUMN, `sum: ${t[i+2].value}`)},
  {t: [T.FUNCTION, T.KEYWORD, T.COLUMN], v: [/avg/, /TYPE/, null], f: (_s, t, i) => createToken(T.COLUMN, `avg: ${t[i+2].value}`)},
  {t: [T.COLUMN, T.KEYWORD, T.CARDINAL], v: [null, /PER/, null],   f: ( s, t, i) => { s.columnsUsed.push(`"${t[i].value}"`); return createToken(T.EXPRESSION, `("${t[i].value}"*${(t[i+2].value as number)/100})`); }},
  {t: [T.COLUMN, T.KEYWORD, T.UNIT],     v: [null, /PER/, null],   f: ( s, t, i) => { s.columnsUsed.push(`"${t[i].value}"`); return createToken(T.EXPRESSION, `("${t[i].value}"*${(t[i+2].value as number)/100})`); }},
  {t: [T.COLUMN, T.KEYWORD, T.UNIT],     v: [null, /AS|IN/, null], f: ( s, t, i) => { s.columnsUsed.push(`"${t[i].value}"`); return createToken(T.EXPRESSION, `("${t[i].value}"/${t[i+2].value})`); }},
  {t: [T.COLUMN],                        v: [null],                f: ( s, t, i) => { s.columnsUsed.push(`"${t[i].value}"`); return createToken(T.VALUE, `"${t[i].value}"`); }},
  {t: [T.NUMBER],                        v: [null],                f: (_s, t, i) => createToken(T.VALUE, `${t[i].value}`)},
  {t: [T.TEXT],                          v: [null],                f: (_s, t, i) => createToken(T.VALUE, `'${t[i].value}'`)},
  {t: [T.KEYWORD],                       v: [/NULL/],              f: (_s, t, i) => createToken(T.VALUE, t[i].value)},
  {t: [T.KEYWORD],                       v: [/TRUE|FALSE/],        f: (_s, t, i) => createToken(T.BOOLEAN, t[i].value)},
];
// T.VALUE: t[i].type


//** Rules for processing expressions. */
const EXPRESSION: InformalizeSubstage[] = [
  {t: [T.OPEN, T.CLOSE],                                                 v: [null, null],                                        f: (_s, _t, _i) => null},
  {t: [T.EXPRESSION, T.EXPRESSION, T.CLOSE],                             v: [null, null, null],                                  f: (_s, t, i) => [createToken(T.EXPRESSION, `${t[i].value}, ${t[i+1].value}`), t[i+2]]},
  {t: [T.FUNCTION],                                                      v: [/pi|random/],                                       f: (_s, t, i) => createToken(T.EXPRESSION, `${t[i].value}()`)},
  {t: [T.FUNCTION, T.OPEN, T.EXPRESSION, T.CLOSE],                       v: [null, null, null, null],                            f: (_s, t, i) => createToken(T.EXPRESSION, `${t[i].value}(${t[i+2].value})`)},
  {t: [T.FUNCTION, T.EXPRESSION],                                        v: [null, null],                                        f: (_s, t, i) => createToken(T.EXPRESSION, `${t[i].value}(${t[i+1].value})`)},
  {t: [T.OPEN, T.EXPRESSION, T.CLOSE],                                   v: [null, null, null],                                  f: (_s, t, i) => createToken(T.EXPRESSION, `(${t[i+1].value})`)},
  {t: [T.OPERATOR, T.BINARY, T.EXPRESSION],                              v: [null, /\+|\-/, null],                               f: (_s, t, i) => [t[i], createToken(t[i+2].type, `${t[i+1].value}${t[i+2].value}`)]},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, /\^/, null],                                  f: (_s, t, i) => createToken(t[i].type & t[i+2].type, `power(${t[i].value},  ${t[i+2].value})`)},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, /[\*\/%]/, null],                             f: (_s, t, i) => createToken(t[i].type & t[i+2].type, `${t[i].value} ${t[i+1].value} ${t[i+2].value}`)},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, /[\+\-]/, null],                              f: (_s, t, i) => createToken(t[i].type & t[i+2].type, `${t[i].value} ${t[i+1].value} ${t[i+2].value}`)},
  {t: [T.UNARY, T.EXPRESSION],                                           v: [/[^(NOT)]/, null],                                  f: (_s, t, i) => createToken(t[i+1].type, `${t[i].value} ${t[i+1].value}`)},
  {t: [T.EXPRESSION, T.UNARY],                                           v: [null, /IS.*/],                                      f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value}`)},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, /[^\w\s=!<>]+/, null],                        f: (_s, t, i) => createToken(T.VALUE, `${t[i].value} ${t[i+1].value} ${t[i+2].value}`)},
  {t: [T.EXPRESSION, T.TERNARY, T.EXPRESSION, T.OPERATOR, T.EXPRESSION], v: [null, null, null, /AND/, null],                     f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value} AND ${t[i+4].value}`)},
  {t: [T.EXPRESSION, T.TERNARY, T.EXPRESSION, T.EXPRESSION],             v: [null, null, null, null],                            f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value} AND ${t[i+3].value}`)},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION, T.OPERATOR, T.EXPRESSION],  v: [null, null, null, /ESCAPE/, null],                  f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value} ESCAPE ${t[i+4].value}`)},
  // {t: [T.VALUE, T.BINARY, T.VALUE, T.OPERATOR, T.VALUE, T.OPERATOR],  v: [null, null, null, /OR|AND/, null, /OR|AND/],        f: ( s, t, i) => [createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value} AND ${t[i].value} ${t[i+1].value} ${t[i+4].value}`), t[i+5]]},
  // {t: [T.VALUE, T.OPERATOR, T.VALUE, T.BINARY, T.VALUE, T.OPERATOR],  v: [null, /OR|AND/, null, null, null, /OR|AND/],        f: ( s, t, i) => [createToken(T.BOOLEAN, `${t[i].value} ${t[i+3].value} ${t[i+4].value} AND ${t[i+2].value} ${t[i+3].value} ${t[i+4].value}`), t[i+5]]},
  {t: [T.KEYWORD, T.VALUE, T.BINARY, T.VALUE, T.OPERATOR, T.VALUE],      v: [null, null, /[^(OR)|(AND)]/, null, /OR|AND/, null], f: (_s, t, i) => i+6>=t.length? [t[i], createToken(T.BOOLEAN, `${t[i+1].value} ${t[i+2].value} ${t[i+3].value} AND ${t[i+1].value} ${t[i+2].value} ${t[i+5].value}`)]:t.slice(i, i+6)},
  {t: [T.KEYWORD, T.VALUE, T.OPERATOR, T.VALUE, T.BINARY, T.VALUE],      v: [null, null, /OR|AND/, null, /[^(OR)|(AND)]/, null], f: (_s, t, i) => i+6>=t.length? [t[i], createToken(T.BOOLEAN, `${t[i+1].value} ${t[i+4].value} ${t[i+5].value} AND ${t[i+3].value} ${t[i+4].value} ${t[i+4].value}`)]:t.slice(i, i+6)},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, /[^(OR)(AND)]/, null],                        f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value}`)},
  {t: [T.UNARY, T.EXPRESSION],                                           v: [null, null],                                        f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value}`)},
  {t: [T.VALUE, T.BINARY, T.VALUE],                                      v: [null, /AND/, null],                                 f: (_s, t, i) => createToken(T.VALUE, `${t[i].value} + ${t[i+2].value}`)},
  {t: [T.BINARY, T.VALUE],                                               v: [/AND/, null],                                       f: ( s, t, i) => { s.columnsUsed.push(t[i+1].value as string); return t[i+1]; }},
  {t: [T.EXPRESSION, T.BINARY, T.EXPRESSION],                            v: [null, null, null],                                  f: (_s, t, i) => createToken(T.BOOLEAN, `${t[i].value} ${t[i+1].value} ${t[i+2].value}`)},
];


/** Rules for processing ORDER BY clauses. */
const ORDERBY: InformalizeSubstage[] = [
  {t: [T.EXPRESSION, T.KEYWORD, T.KEYWORD],   v: [null, /DESC/, /NULLS (FIRST|LAST)/], f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'ASC':'DESC'} ${t[i+2].value}`); return null; }},
  {t: [T.EXPRESSION, T.KEYWORD, T.KEYWORD],   v: [null, /ASC/, /NULLS (FIRST|LAST)/],  f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'DESC':'ASC'} ${t[i+2].value}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION, T.KEYWORD],   v: [/DESC/, null, /NULLS (FIRST|LAST)/], f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'ASC':'DESC'} ${t[i+2].value}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION, T.KEYWORD],   v: [/ASC/, null, /NULLS (FIRST|LAST)/],  f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'} ${t[i+2].value}`); return null; }},
  {t: [T.OPERATOR, T.OPERATOR, T.EXPRESSION], v: [/>|>=/, /IN/, null],                 f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'ASC':'DESC'}`); return null; }},
  {t: [T.OPERATOR, T.OPERATOR, T.EXPRESSION], v: [/<|<=/, /IN/, null],                 f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'}`); return null; }},
  {t: [T.EXPRESSION, T.KEYWORD],              v: [null, /NULLS (FIRST|LAST)/],         f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'DESC':'ASC'} ${t[i+1].value}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],              v: [/NULLS (FIRST|LAST)/, null],         f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'} ${t[i].value}`); return null; }},
  {t: [T.EXPRESSION, T.KEYWORD],              v: [null, /DESC/],                       f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'ASC':'DESC'}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],              v: [/DESC/, null],                       f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'ASC':'DESC'}`); return null; }},
  {t: [T.EXPRESSION, T.KEYWORD],              v: [null, /ASC/],                        f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'DESC':'ASC'}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],              v: [/ASC/, null],                        f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'}`); return null; }},
  {t: [T.OPERATOR, T.EXPRESSION],             v: [/>|>=/, null],                       f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'ASC':'DESC'}`); return null; }},
  {t: [T.OPERATOR, T.EXPRESSION],             v: [/<|<=/, null],                       f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'}`); return null; }},
  {t: [T.EXPRESSION, T.OPERATOR],             v: [null, />|>=/],                       f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'ASC':'DESC'}`); return null; }},
  {t: [T.EXPRESSION, T.OPERATOR],             v: [null, /<|<=/],                       f: (s, t, i) => { s.orderBy.push(`${t[i].value} ${s.reverse? 'DESC':'ASC'}`); return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],              v: [/ORDER BY/, null],                   f: (s, t, i) => { s.orderBy.push(`${t[i+1].value} ${s.reverse? 'DESC':'ASC'}`); return t[i]; }},
];


/** Rules for processing GROUP BY clauses. */
const GROUPBY: InformalizeSubstage[] = [
  {t: [T.KEYWORD, T.EXPRESSION], v: [/GROUP BY/, null], f: (s, t, i) => { s.groupBy.push(`${t[i+1].value}`); return t[i]; }},
];


/** Rules for processing HAVING clauses. */
const HAVING: InformalizeSubstage[] = [
  {t: [T.OPERATOR, T.OPERATOR, T.KEYWORD, T.EXPRESSION], v: [/OR|AND/, /NOT/, /HAVING/, null], f: (s, t, i) => { s.having += `${t[i].value} (NOT ${t[i+3].value})`; return null; }},
  {t: [T.OPERATOR, T.KEYWORD, T.EXPRESSION],             v: [/NOT/, /HAVING/, null],           f: (s, t, i) => { s.having += `AND (NOT ${t[i+2].value})`; return null; }},
  {t: [T.OPERATOR, T.KEYWORD, T.EXPRESSION],             v: [/OR|AND/, /HAVING/, null],        f: (s, t, i) => { s.having += `${t[i].value} (${t[i+2].value})`; return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],                         v: [/HAVING/, null],                  f: (s, t, i) => { s.having += `AND (${t[i+1].value})`; return null; }},
];


/** Rules for processing WHERE clauses. */
const WHERE: InformalizeSubstage[] = [
  {t: [T.OPERATOR, T.OPERATOR, T.KEYWORD, T.EXPRESSION], v: [/OR|AND/, /NOT/, /WHERE/, null], f: (s, t, i) => { s.where += `${t[i].value} (NOT ${t[i+3].value})`; return null; }},
  {t: [T.OPERATOR, T.KEYWORD, T.EXPRESSION],             v: [/NOT/, /WHERE/, null],           f: (s, t, i) => { s.where += `AND (NOT ${t[i+2].value})`; return null; }},
  {t: [T.OPERATOR, T.KEYWORD, T.EXPRESSION],             v: [/OR|AND/, /WHERE/, null],        f: (s, t, i) => { s.where += `${t[i].value} (${t[i+2].value})`; return null; }},
  {t: [T.KEYWORD, T.EXPRESSION],                         v: [/WHERE/, null],                  f: (s, t, i) => { s.where += `AND (${t[i+1].value})`; return null; }},
];


/** Rules for processing FROM clauses. */
const FROM: InformalizeSubstage[] = [
  {t: [T.OPERATOR, T.ENTITY, T.OPERATOR], v: [/ALL/, /(field|column)s?/i, null], f: (s, _t, _i) => { s.columns.push('*'); return null; }},
  {t: [T.KEYWORD],                        v: [/GROUP BY/],                       f: (s, t, i) => { if (i!==t.length-1 || s.groupBy.length!==0) return t[i]; s.from.push('"groups"'); return null; }},
  {t: [T.TABLE],                          v: [null],                             f: (s, t, i) => { s.from.push(`"${t[i].value}"`); return null; }},
  {t: [T.ROW],                            v: [null],                             f: (s, t, i) => { s.from.push(`"${t[i].value}"`); return null; }},
];


/** Rules for processing column-related tokens. */
const COLUMN: InformalizeSubstage[] = [
  {t: [T.KEYWORD, T.KEYWORD, T.EXPRESSION, T.KEYWORD, T.EXPRESSION], v: [/SELECT/, /ALL|DISTINCT/, null, /AS/, null], f: (s,  t,  i) => { s.columns.push(`${t[i+1].value} ${t[i+2].value} AS ${t[i+4].value}`); return t[i]; }},
  {t: [T.KEYWORD, T.KEYWORD, T.EXPRESSION],                          v: [/SELECT/, /ALL|DISTINCT/, null],             f: (s,  t,  i) => { s.columns.push(`${t[i+1].value} ${t[i+2].value}`); return t[i]; }},
  {t: [T.KEYWORD, T.EXPRESSION, T.KEYWORD, T.EXPRESSION],            v: [/SELECT/, null, /AS/, null],                 f: (s,  t,  i) => { s.columns.push(`${t[i+1].value} AS ${t[i+3].value}`); return t[i]; }},
  {t: [T.KEYWORD, T.EXPRESSION],                                     v: [/SELECT/, null],                             f: (s,  t,  i) => { s.columns.push(t[i+1].value as string); return t[i]; }},
  {t: [T.OPERATOR, T.OPERATOR],                                      v: [/ALL/, null],                                f: (s, _t, _i) => { s.columns.push('*'); return null; }},
  {t: [T.OPERATOR],                                                  v: [/ALL/],                                      f: (s,  t,  i) => { if (i!==t.length-1) return t[i]; s.columns.push('*'); return null; }},
];
//#endregion




//#region FUNCTIONS
/**
 * Add all elements of a list to a set.
 * @param set set to add elements to
 * @param list list of elements to add
 * @returns updated set
 */
function setAddAll<T>(set: Set<T>, list: Iterable<T>): Set<T> {
  for (const v of list)
    set.add(v);
  return set;
}


/**
 * Check if a sequence of tokens matches a given type pattern.
 * @param tokens tokens to check
 * @param i start index in the tokens array
 * @param typ type pattern to match
 * @returns true if the tokens match the pattern, false otherwise
 */
function matchTokenTypeInformalize(tokens: Token[], i: number, typ: T[]): boolean {
  if (i+typ.length > tokens.length) return false;
  for (let j=0, J=typ.length; j<J; i++, j++)
    if ((tokens[i].type & 0xF0)!==(typ[j] & 0xF0) || ((typ[j] & 0xF) > 0 && tokens[i].type!==typ[j])) return false;
  return true;
}


/**
 * Check if a sequence of tokens matches a given value pattern.
 * @param tokens tokens to check
 * @param i start index in the tokens array
 * @param val value pattern to match
 * @returns true if the tokens match the pattern, false otherwise
 */
function matchValueInformalize(tokens: Token[], i: number, val: RegExp[]) {
  for (let j=0, J=val.length; j<J; i++, j++)
    if (val[j]!=null && !val[j].test(tokens[i].value as string)) return false;
  return true;
}


/**
 * Run a substage of the processing pipeline.
 * @param substage substage definition, containing type, value, and function
 * @param state current state object
 * @param tokens tokens to process
 * @param repeat repeat the substage until no changes occur?
 * @returns processed tokens
 */
function runInformalizeSubstage(substage: InformalizeSubstage, state: InformalizeState, tokens: Token[], repeat=false) {
  let a = tokens;
  do {
    tokens = a; a = [];
    for (let i=0, I=tokens.length; i<I; i++) {
      if (!matchTokenTypeInformalize(tokens, i, substage.t) || !matchValueInformalize(tokens, i, substage.v as RegExp[])) {
        a.push(tokens[i]); continue;
      }
      const ans = substage.f(state, tokens, i);
      i = i + substage.t.length - 1;
      if (ans==null) continue;
      else if (!Array.isArray(ans)) a.push(ans);
      a.push.apply(a, ans as Token[]);
    }
  } while (repeat && a.length < tokens.length);
  return a;
}


/**
 * Run a stage of the processing pipeline, which contains multiple substages.
 * @param stage stage definition, containing an array of substages
 * @param state current state object
 * @param tokens tokens to process
 * @param rsubstage repeat the substage until no changes occur?
 * @param rstage repeat the stage until no changes occur?
 * @returns processed tokens
 */
function runInformalizeStage(stage: InformalizeSubstage[], state: InformalizeState, tokens: Token[], rsubstage=false, rstage=false) {
  let a = tokens;
  let plen = 0;
  do {
    plen = tokens.length;
    for (const sub of stage)
      a = runInformalizeSubstage(sub, state, tokens=a, rsubstage);
  } while(rstage && a.length<plen);
  return a;
}


/**
 * Process the columns selected in the query.
 * @param state current state object
 * @param opt optional parameters, including column hints
 * @returns processed columns
 */
function processColumnsInformalize(state: InformalizeState, opt: InformalizeOptions={}): string[] {
  const cols = new Set<string>(state.columns);
  if (cols.has('"*"')) cols.add('*');
  cols.delete('"*"');
  if (cols.size===0 || !cols.has('*')) {
    for (const ord of state.orderBy)
      cols.add(ord.replace(/ (ASC|DESC)$/, ''));
    for (const col of state.groupBy.length? [] : state.columnsUsed)
      cols.add(col);
  }
  const colt = new Set<string>(state.groupBy);
  if (!cols.has('*')) {
    const ocols = opt.columns as Record<string, Iterable<string>>;
    for (const hnt of state.hints)
      if (hnt in ocols||{}) setAddAll(colt, ocols[hnt]);
  }
  setAddAll(colt, cols);
  if (colt.size===0) colt.add('*');
  return Array.from(colt);
  // if (data.table(s.from[0].replace(/\"/g, ''))!=='compositions_tsvector') { if (s.columns.length===0) s.columns.push('*'); }
}


/**
 * Process an array of tokens to generate an SQL-like query string.
 * @param tokens tokens to process
 * @param opt optional parameters, including table name and column hints
 * @returns generated SQL-like query string
 */
function processTokensInformalize(tokens: Token[], opt: InformalizeOptions={}) {
  const s: InformalizeState = {
    columns: [],
    from:    [],
    groupBy: [],
    orderBy: [],
    where:  '',
    having: '',
    limit:  0,
    columnsUsed: [],
    reverse: false,
    hints:   new Set(),
  };
  tokens = tokens.filter(t => t.type!==T.SEPARATOR);
  for (const t of tokens)
    if (t.hint!=null) s.hints.add(t.hint as string);
  if (tokens[0].value!=='SELECT') tokens.unshift(createToken(T.KEYWORD, 'SELECT'));
  tokens = runInformalizeStage(NULLORDER, s, tokens);
  tokens = runInformalizeStage(NUMBER, s, tokens);
  tokens = runInformalizeStage(LIMIT, s, tokens);
  tokens = runInformalizeStage(VALUE, s, tokens);
  tokens = runInformalizeStage(EXPRESSION, s, tokens, true, true);
  tokens = runInformalizeStage(ORDERBY, s, tokens, false, true);
  tokens = runInformalizeStage(GROUPBY, s, tokens, true);
  tokens = runInformalizeStage(HAVING, s, tokens);
  tokens = runInformalizeStage(WHERE, s, tokens);
  tokens = runInformalizeStage(FROM, s, tokens);
  tokens = runInformalizeStage(COLUMN, s, tokens);
  if (s.having.startsWith('AND ')) s.having = s.having.substring(4);
  if (s.where.startsWith('AND '))  s.where  = s.where.substring(4);
  if (s.from.length===0) s.from.push(`"${opt.table}"`);
  s.columns = processColumnsInformalize(s, opt);
  let a = `SELECT ${s.columns.join(', ')} FROM ${s.from.join(', ')}`;
  if (s.where.length > 0)   a += ` WHERE ${s.where}`;
  if (s.groupBy.length > 0) a += ` GROUP BY ${s.groupBy.join(', ')}`;
  if (s.orderBy.length > 0) a += ` ORDER BY ${s.orderBy.join(', ')}`;
  if (s.having.length > 0)  a += ` HAVING ${s.having}`;
  if (s.limit > 0)          a += ` LIMIT ${s.limit}`;
  return a;
}


/**
 * Process a string of english text to generate an informal SQL-like query.
 * @param txt english text to process
 * @param fn entity test function `fn(words)`
 * @param ths this argument
 * @param opt optional parameters, including table name and column hints
 * @returns generated SQL-like query string (promise)
 */
export async function convertToInformalSQL(txt: string, fn: EntityTestFunction, ths: unknown=null, opt: InformalizeOptions={}): Promise<string> {
  let tokens = parseTokens(txt);
  tokens = processNumberTokens(tokens);
  tokens = processUnitTokens(tokens);
  tokens = processReservedTokens(tokens);
  tokens = await processEntityTokens(tokens, fn, ths);
  tokens = tokens.filter((v) => v.type!==T.TEXT || !/[~!@#$:,\?\.\|\/\\]/.test(v.value as string));
  if (tokens.length>0 && (tokens[0].type & 0xF0)!==T.KEYWORD) tokens.unshift(createToken(T.KEYWORD, 'SELECT'));
  return processTokensInformalize(tokens, opt);
}
//#endregion
