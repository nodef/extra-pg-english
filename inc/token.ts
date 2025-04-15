//#region TYPES
/** Token types. */
export enum TokenType {
  NONE      = 0x00,
  TEXT      = 0x10,
  NORMAL    = 0x11,
  QUOTED    = 0x12,
  NUMBER    = 0x20,
  CARDINAL  = 0x21,
  ORDINAL   = 0x22,
  UNIT      = 0x30,
  MASS      = 0x31,
  ENTITY    = 0x40,
  TABLE     = 0x41,
  COLUMN    = 0x42,
  ROW       = 0x43,
  BRACKET   = 0x50,
  OPEN      = 0x51,
  CLOSE     = 0x52,
  SEPARATOR = 0x60,
  OPERATOR  = 0x70,
  UNARY     = 0x71,
  BINARY    = 0x72,
  TERNARY   = 0x73,
  FUNCTION  = 0x80,
  KEYWORD   = 0x90,
  EXPRESSION = 0xA0,
  VALUE     = 0xA1,
  BOOLEAN   = 0xA2,
}


/** Represents a token. */
export interface Token {
  /** Type of the token. */
  type: TokenType;
  /** Value of the token. */
  value: unknown;
  /** Hint for the token. */
  hint: unknown;
}
//#endregion




//#region FUNCTIONS
/**
 * Create a token.
 * @param type type of the token [0]
 * @param value associated value
 * @param hint associated hint
 * @returns the token object
 */
export function createToken(type=0, value: unknown=null, hint: unknown=null): Token {
  return {type, value, hint};
}


/**
 * Parse the input text into tokens.
 * @param txt input text to parse
 * @returns parsed tokens
 */
export function parseTokens(txt: string): Token[] {
  let quo: string | null = null, x = '';
  const a: Token[] = [];
  for (const c of txt) {
    if ((quo && quo!=c) || /\w/.test(c)) { x += c; continue; }
    if (x) { a.push(createToken(quo? TokenType.QUOTED : TokenType.TEXT, x)); x = ''; }
    if (/[\'\"\`]/.test(c)) quo = !quo? c : null;
    else if (/\S/g.test(c)) a.push(createToken(TokenType.TEXT, c));
  }
  if (x) a.push(createToken(quo? TokenType.QUOTED : TokenType.TEXT, x));
  return a;
}


/**
 * Convert an array of tokens back to a string.
 * @param tokens array of tokens
 * @returns string representation of tokens
 */
export function stringifyTokens(tokens: Token[]): string {
  let a = '';
  for (const t of tokens)
    a += t.value + ' ';
  return a.trim();
}
//#endregion
