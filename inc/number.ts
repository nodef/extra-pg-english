import {TokenType as T, type Token, createToken} from "./token.ts";




//#region CONSTANTS
/** Words representing decimal points. */
const DECIMAL = new Set(['dot', 'point', 'decimal']);


/** Words representing special numbers. */
const SPECIAL = new Map([
  ['infinity', Infinity],
  ['infinite', Infinity],
  ['inf',      Infinity],
  ['∞',        Infinity],
  ['not-a-number',  NaN],
  ['not-number',    NaN],
  ['nan',           NaN],
]);


/** Words representing cardinal numbers. */
const CARDINAL = new Map([
  ['oh',     0],
  ['nil',    0],
  ['zero',   0],
  ['nought', 0],
  ['naught', 0],
  ['one',    1],
  ['two',    2],
  ['three',  3],
  ['four',   4],
  ['five',   5],
  ['six',    6],
  ['seven',  7],
  ['eight',  8],
  ['nine',   9],
  ['ten',       10],
  ['eleven',    11],
  ['twelve',    12],
  ['thirteen',  13],
  ['fourteen',  14],
  ['fifteen',   15],
  ['sixteen',   16],
  ['seventeen', 17],
  ['eighteen',  18],
  ['nineteen',  19],
  ['twenty',    20],
  ['thirty',    30],
  ['forty',     40],
  ['fifty',     50],
  ['sixty',     60],
  ['seventy',   70],
  ['eighty',    80],
  ['ninety',    90],
  ['hundred',   1e+2],
  ['thousand',  1e+3],
  ['lakh',        1e+5],
  ['million',     1e+6],
  ['crore',       1e+7],
  ['billion',     1e+9],
  ['trillion',    1e+12],
  ['quadrillion', 1e+15],
  ['quintillion', 1e+18],
  ['sextillion',  1e+21],
  ['septillion',  1e+24],
  ['octillion',   1e+27],
  ['nonillion',   1e+30],
  ['decillion',   1e+33]
]);


/** Words representing ordinal numbers. */
const ORDINAL = new Map([
  ['zeroth',  0],
  ['first',   1],
  ['half',    2],
  ['second',  2],
  ['third',   3],
  ['quarter', 4],
  ['fourth',  4],
  ['fifth',   5],
  ['sixth',   6],
  ['seventh', 7],
  ['eighth',  8],
  ['ninth',   9],
  ['tenth',       10],
  ['eleventh',    11],
  ['twelfth',     12],
  ['thirteenth',  13],
  ['fourteenth',  14],
  ['fifteenth',   15],
  ['sixteenth',   16],
  ['seventeenth', 17],
  ['eighteenth',  18],
  ['nineteenth',  19],
  ['twentieth',   20],
  ['thirtieth',   30],
  ['fortieth',    40],
  ['fiftieth',    50],
  ['sixtieth',    60],
  ['seventieth',  70],
  ['eightieth',   80],
  ['ninetieth',   90],
  ['hundredth',   1e+2],
  ['thousandth',  1e+3],
  ['lakhth',        1e+5],
  ['millionth',     1e+6],
  ['croreth',       1e+7],
  ['billionth',     1e+9],
  ['trillionth',    1e+12],
  ['quadrillionth', 1e+15],
  ['quintillionth', 1e+18],
  ['sextillionth',  1e+21],
  ['septillionth',  1e+24],
  ['octillionth',   1e+27],
  ['nonillionth',   1e+30],
  ['decillionth',   1e+33]
]);
//#endregion




//#endregion
/**
 * Find logarithm base 10 of a number.
 * @param x a number
 * @returns log base 10 of x
 */
function log10(x: number): number {
  return x<1? 0 : Math.floor(Math.log10(x));
}


/**
 * Fuse the last two numeric groups in the state array.
 * @param s state array
 * @param i index in the state array
 */
function numberStateFuse(s: number[], i=s.length) {
  if (s[i-2] <= s[i-4]) s[i-6] += s[i-3];
  else {
    s[i-6] = s[i-6] * (10 ** s[i-2]) + s[i-3];
    s[i-5] += s[i-2];
  }
  s[i-4] = s[i-2];
}


/**
 * Compute the numeric value represented by the state array.
 * @param s state array
 * @param pre prefix value for the computed number
 * @returns computed numeric value
 */
function numberStateValue(s: number[], pre=NaN) {
  let i = 0;
  if (s.length===0) return Number.isNaN(pre)? 0 : pre;
  for (i=s.length; i>3; i-=3) numberStateFuse(s, i);
  return Number.isNaN(pre)? s[i-3] : pre + s[i-3] * (10 ** -s[i-2]);
}


/**
 * Add a numeric value to an existing state array that represents a partial number.
 * @param s state array to add the number to
 * @param num number to add
 */
function numberStateAdd(s: number[], num: number) {
  let   i   = s.length;
  const len = log10(num) + 1;
  const spc = num<20? 0 : len-1;
  if (i===0 || num<100) return s.push(num, len, spc);
  for (; i>3 && s[i-2] + spc > s[i-4]; i-=3) numberStateFuse(s, i);
  s[i-3] *= num;
  s[i-2] += spc;
  s[i-1] += spc;
  s.length = i;
}


/**
 * Add an ordinal number to an existing state array that represents a partial number.
 * @param s state array to add the number to
 * @param num number to add
 */
function numberStateAddOrdinal(s: number[], num: number) {
  const val = numberStateValue(s);
  if (val>=20) return numberStateAdd(s, num);
  s.length = 0;
  s.push(val/num, 1, 0);
}


/**
 * Process a list of tokens, and return a new list with the number tokens processed.
 * @param tokens tokens to be processed
 * @returns processed tokens
 */
export function processNumberTokens(tokens: Token[]): Token[] {
  let pre = NaN, val = false;
  let brk: Token | null = null;
  const s: number[] = [];
  const a: Token[]  = [];
  for (const t of tokens) {
    const txt = (t.type & 0xF0)===T.TEXT? (t.value as string).replace(/[\s,]/g, '').toLowerCase() : null;
    if (val && (!txt || brk)) {
      a.push(createToken(T.CARDINAL, numberStateValue(s, pre)));
      s.length = 0; pre = NaN, val = false;
    }
    if (brk && brk.type>0) a.push(brk);
    brk = null;
    if (!txt) { a.push(t); continue; }
    if (SPECIAL.has(txt))  { brk = createToken(T.CARDINAL, SPECIAL.get(txt)); continue; }
    if (ORDINAL.has(txt))  { numberStateAddOrdinal(s, ORDINAL.get(txt) as number); val = true; brk = createToken(); continue; }
    if (DECIMAL.has(txt))  { pre = numberStateValue(s); s.length = 0; continue; }
    if (CARDINAL.has(txt)) { numberStateAdd(s, CARDINAL.get(txt) as number); val = true; continue; }
    if (isNaN(txt as unknown as number)) { brk = t; continue; }
    brk = createToken(T.CARDINAL, parseFloat(txt));
  }
  if (val) a.push(createToken(T.CARDINAL, numberStateValue(s, pre)));
  if (brk && brk.type>0) a.push(brk);
  return a;
}
//#endregion
