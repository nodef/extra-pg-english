import {TokenType as T, type Token, createToken} from "./token.ts";




//#region TYPES
export interface EntityMatch {
  /** The type of entity (table, column, row). */
  type: string;
  /** The value of the entity. */
  value: string;
  /** The length of the entity in words. */
  length: number;
  /** An optional hint for the entity. */
  hint?: string;
};


/** Test function for entities. */
export type EntityTestFunction = (words: string[]) => Promise<EntityMatch | null>;
//#endregion




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
 * @param fn entity test function `(words) => {type, value, length, hint?}`
 * @param ths this object
 * @returns processed tokens
 */
async function entityBlockScan(txts: string[], fn: EntityTestFunction, ths: unknown=null): Promise<Token[]> {
  const a: Token[] = [];
  for (let i=0, I=txts.length; i<I;) {
    const ans = await fn.call(ths, txts.slice(i, I));
    if (ans==null) { a.push(createToken(T.TEXT, txts[i++])); continue; }
    const typ = EntityType.get((ans.type)[0].toLowerCase()) || 0;
    a.push(createToken(typ, ans.value, ans.hint || null));
    i += ans.length;
  }
  return a;
}


/**
 * Process a block of tokens, and return a new list with the entity tokens processed.
 * @param tokens tokens to be processed
 * @param fn entity test function `(words) => {type, value, length, hint?}`
 * @param ths this object
 * @returns processed tokens
 */
export async function processEntityTokens(tokens: Token[], fn: EntityTestFunction, ths: unknown=null): Promise<Token[]> {
  let  txts: string[] = [];
  const blk: Promise<Token[]>[] = [];
  const a: Token[] = [];
  for (const t of tokens) {
    if ((t.type & 0xF0)===T.TEXT) { txts.push(t.value as string); continue; }
    if (txts.length>0) { blk.push(entityBlockScan(txts, fn, ths)); txts = []; }
    blk.push(Promise.resolve([t]));
  }
  if (txts.length>0) blk.push(entityBlockScan(txts, fn, ths));
  const ans = await Promise.all(blk);
  for (const arr of ans)
    a.push.apply(a, arr);
  return a;
}
//#endregion
