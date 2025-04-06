import {TokenType as T, Token, createToken} from "./token";




//#region CONSTANTS
/** Token type for entities. */
const EntityType = new Map([
  ['t', T.TABLE],
  ['c', T.COLUMN],
  ['r', T.ROW],
]);
//#endregion




//#region FUNCTIONS
/**
 * Scan a block of text, and attempt to find entities in it, using a provided function.
 * @param txts words to be processed
 * @param fn entity test function `(words) => { type: string[], value: string, length: number, hint?: string }`
 * @param ths this object
 * @returns processed tokens
 */
async function entityBlockScan(txts: string[], fn: Function, ths: any=null): Promise<Token[]> {
  var a: Token[] = [];
  for (var i=0, I=txts.length; i<I;) {
    var ans = await fn.call(ths, txts.slice(i, I));
    if (ans==null) { a.push(createToken(T.TEXT, txts[i++])); continue; }
    var typ = EntityType.get(ans.type[0].toLowerCase()) || 0;
    a.push(createToken(typ,  ans.value, ans.hint || null));
    i += ans.length;
  }
  return a;
}


/**
 * Process a block of tokens, and return a new list with the entity tokens processed.
 * @param tokens tokens to be processed
 * @param fn entity test function `(words) => { type: string[], value: string, length: number, hint?: string }`
 * @param ths this object
 * @returns processed tokens
 */
export async function processEntityTokens(tokens: Token[], fn: Function, ths: any=null): Promise<Token[]> {
  var blk: Promise<Token[]>[] = [], txts: string[] = [];
  var a: Token[] = [];
  for (var t of tokens) {
    if ((t.type & 0xF0)===T.TEXT) { txts.push(t.value); continue; }
    if (txts.length>0) { blk.push(entityBlockScan(txts, fn, ths)); txts = []; }
    blk.push(Promise.resolve([t]));
  }
  if (txts.length>0) blk.push(entityBlockScan(txts, fn, ths));
  var ans = await Promise.all(blk);
  for (var arr of ans)
    a.push.apply(a, arr);
  return a;
}
//#endregion
