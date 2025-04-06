import {TokenType as T, Token, createToken} from "./token";




//#region CONSTANTS
/** Scaling factors for mass units. */
const UNITS_MASS = new Map([
  ['attogram',  1e-18],
  ['ag',        1e-18],
  ['femtogram', 1e-15],
  ['fg',        1e-15],
  ['picogram',  1e-12],
  ['pg',        1e-12],
  ['nanogram',  1e-9],
  ['ng',        1e-9],
  ['microgram', 1e-6],
  ['μg',        1e-6],
  ['ug',        1e-6],
  ['milligram', 1e-3],
  ['mg',        1e-3],
  ['centigram', 1e-2],
  ['cg',        1e-2],
  ['decigram',  1e-1],
  ['dg',        1e-1],
  ['gram',      1],
  ['gm',        1],
  ['g',         1],
  ['decagram',  1e+1],
  ['dekagram',  1e+1],
  ['dag',       1e+1],
  ['hectogram', 1e+2],
  ['hg',        1e+2],
  ['kilogram',  1e+3],
  ['kg',        1e+3],
  ['megagram',  1e+6],
  ['Mg',        1e+6],
  ['gigagram',  1e+9],
  ['Gg',        1e+9],
  ['teragram',  1e+12],
  ['Tg',        1e+12],
  ['petagram',  1e+15],
  ['Pg',        1e+15],
  ['exagram',   1e+18],
  ['Eg',        1e+18],
  ['quintal',   1e+5],
  ['metricton', 1e+6],
  ['tonne',     1e+6],
  ['ton',       1e+6],
  ['pound',     453.59237],
  ['lb',        453.59237],
]);
//#endregion




//#region FUNCTIONS
/**
 * Stem a (unit) text to its base form.
 * @param txt text to be stemmed
 * @returns stemmed text
 */
function stemUnitText(txt: string): string {
  return txt.search(/[sS]$/g)>0? txt.substring(0, txt.length-1) : txt;
}


/**
 * Process a (unit) text and return its unit object, if it is a valid unit.
 * @param txt word to be processed
 * @returns unit object or null
 */
function processUnitText(txt: string): Token | null {
  if (UNITS_MASS.has(txt = stemUnitText(txt))) return createToken(T.MASS, UNITS_MASS.get(txt));
  if (UNITS_MASS.has(txt = txt.toLowerCase())) return createToken(T.MASS, UNITS_MASS.get(txt));
  return null;
}


/**
 * Process a list of tokens, and return a new list with the unit tokens processed.
 * @param tokens tokens to be processed
 * @returns processed tokens
 */
export function processUnitTokens(tokens: Token[]): Token[] {
  var a: Token[] = [];
  for (var t of tokens) {
    var txt  = t.type===T.TEXT? t.value : null;
    var unit = txt? processUnitText(txt) : null;
    a.push(unit? unit : t);
  }
  return a;
}
//#endregion
