import {assert, assertEquals} from "jsr:@std/assert";
import {
  convertToInformalSQL,
  convertToFormalSQL,
} from "./index.ts";




//#region TESTING CONVERT TO INFORMAL SQL
Deno.test('convertToInformalSQL', async () => {
  async function entityMatchFunction(txts: string[]) {
    let   a   = null;
    const txt = txts.join(' ');
    if (txt.startsWith('ascorbic acid')) a = {type: 'column', value: 'ASCORBIC ACID', length: 2};
    else if (txt.startsWith('food'))     a = {type: 'table',  value: 'FOOD', length: 1};
    return a;
  }
  const ans = await convertToInformalSQL('show food with ascorbic acid less than twenty nine mg', entityMatchFunction);
  assertEquals(ans, 'SELECT "ASCORBIC ACID" FROM "FOOD" WHERE ("ASCORBIC ACID" < 0.029)');
});
//#endregion




//#region TESTING CONVERT TO FORMAL SQL
Deno.test('convertToFormalSQL', async () => {
  async function resolveFunctionA(_text: string, type: string, _hint: string | null, _from: string) {
    return type==='from'? ['table'] : ['column'];
  }
  const ans = await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, resolveFunctionA);
  assertEquals(ans, 'SELECT "column", "column" FROM "table" WHERE TRUE AND TRUE');
});


Deno.test('convertToFormalSQL with options', async () => {
  async function resolveFunctionB(_text: string, type: string, _hint: string | null, _from: string) {
    if (type==='from') return ['compositions'];
    return ['ca', 'ca_e'];
  }
  const ans = await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, resolveFunctionB);
  assertEquals(ans, 'SELECT "ca", "ca_e", "ca", "ca_e" FROM "compositions" WHERE TRUE AND TRUE');
});


Deno.test('convertToFormalSQL with options and from and where', async () => {
  const columns: Map<string, string[]> = new Map([
    ['food code', ['code']],
    ['food name', ['name']],
    ['calcium', ['ca', 'ca_e']],
    ['magnesium', ['mg', 'mg_e']]
  ]);
  const tables = ['food', 'compositions'];
  async function resolveFunctionC(text: string, type: string, _hint: string | null, _from: string) {
    if (type==='from') return tables.includes(text)? ['compositions'] : [];
    return columns.get(text) as string[];
  }
  const ans = await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, resolveFunctionC);
  assertEquals(ans, 'SELECT "name", "ca", "ca_e" FROM "null" WHERE TRUE AND TRUE');
});


Deno.test('convertToFormalSQL with options and from and where and tsvector', async () => {
  const columns: Map<string, string[]> = new Map([
    ['food code', ['code']],
    ['food name', ['name']],
    ['calcium',   ['ca', 'ca_e']],
    ['magnesium', ['mg', 'mg_e']]
  ]);
  const tables = ['food', 'compositions'];
  async function resolveFunctionD(text: string, type: string, _hint: string | null, _from: string) {
    if (type==='from') return tables.includes(text)? ['compositions'] : [`"tsvector" @@ '${text}'`];
    return columns.get(text) as string[];
  }
  const ans = await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, resolveFunctionD);
  assertEquals(ans, 'SELECT "name", "ca", "ca_e" FROM "null" WHERE TRUE AND (FALSE OR ("tsvector" @@ \'apples\'))');


  const options = {from: 'compositions'};
  const ant = await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, resolveFunctionD, null, options);
  assertEquals(ant, 'SELECT "name", "ca", "ca_e" FROM "compositions" WHERE TRUE AND (FALSE OR ("tsvector" @@ \'apples\'))');
});
