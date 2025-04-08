Convert [english query] to [SQL SELECT].

▌
📦 [Node.js](https://www.npmjs.com/package/extra-pg-english),
📜 [Files](https://unpkg.com/extra-pg-english/),
📰 [Docs](https://nodef.github.io/extra-pg-english/),
📘 [Wiki](https://github.com/nodef/extra-pg-english/wiki/).

<br>


```javascript
import {convertToInformalSQL} from 'extra-pg-english';
// convertToInformalSQL(<text>, <match fn>, [this], [options])
// -> Promise (processed text)

// <match fn>(<texts>)
// - texts: array of text
// -> Promise {type, value, length}
// - type: token type (table/column/row)
// - value: token value
// - hint: token hint (identifies table)
// - length: token length (from start of texts)

// options: {
//   table: undefined,       // default table: none
//   columns: {<table>: []}, // default columns per table: none
// }


async function match(txts) {
  var a = null, txt = txts.join(' ');
  if (txt.startsWith('ascorbic acid')) a = {type: 'column', value: 'ASCORBIC ACID', length: 2};
  else if (txt.startsWith('food'))     a = {type: 'table',  value: 'FOOD', length: 1};
  return a;
}
await convertToInformalSQL('show food with ascorbic acid less than twenty nine mg', match);
// → SELECT "ASCORBIC ACID" FROM "FOOD" WHERE ("ASCORBIC ACID" < 0.029)
```

```typescript
import {convertToFormalSQL} from 'extra-pg-english';
// convertToFormalSQL(<informal sql>, <map fn>, [this], [options])
// -> Promise (formal sql)

// <informal sql>:
// SELECT "food name", "trans fat" FROM "food" ORDER BY "trans fat" DESC
// SELECT "protein", "vitamin d" FROM "poultry ORDER BY "vitamin d" DESC
// SELECT "sum: essential amino acids" AS "amino" FROM "meat" ORDER BY "amino"
// ...

// <map fn>(<text>, <type>, [hint], [from]):
// - text: field name, like "food name", "trans fat", "food", ...
// - type: field type, can be "from","columns", "where", "having", "orderBy", or "groupBy"
// - hint: field hint, can be null, "all", "sum", or "avg"
// - from: field from, will be null for type=table
// -> Promise [<value>]
// - value: expression string

// [options]:
// - from: default table
// - limit: default maximum limit
// - limits: table specific maximum limts


async function mapFnA(text, type, hint, from) {
  return ['sample1', 'sample1'];
}
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnA);
// → SELECT "sample", "sample" FROM "sample" WHERE TRUE AND TRUE


async function mapFnB(text, type, hint, from) {
  if (type==='column') return ['name'];
  return ['compositions'];
}
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnB);
// → SELECT "name", "name" FROM "compositions" WHERE TRUE AND TRUE


async function mapFnC(text, type, hint, from) {
  if (type==='column') return ['ca', 'ca_e'];
  return ['compositions'];
}
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnC);
// → SELECT "ca", "ca_e", "ca", "ca_e" FROM "compositions" WHERE TRUE AND TRUE


var columns = {
  'food code': ['code'],
  'food name': ['name'],
  'calcium': ['ca', 'ca_e'],
  'magnesium': ['mg', 'mg_e']
};
var tables = ['food', 'compositions'];
async function mapFnD(text, type, hint, from) {
  if (type==='column') return columns[text];
  return tables.includes(text)? ['compositions'] : [];
}
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnD);
// → SELECT "name", "ca", "ca_e" FROM "null" WHERE TRUE AND TRUE


async function mapFnE(text, type, hint, from) {
  if (type==='column') return columns[text];
  return tables.includes(text)? ['compositions'] : [`"tsvector" @@ '${text}'`];
}
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnE);
// → SELECT "name", "ca", "ca_e" FROM "null" WHERE TRUE AND (FALSE OR ("tsvector" @@ 'apples'))


var options = {from: 'compositions'};
await convertToFormalSQL(`SELECT "food name", "calcium" FROM "apples"`, mapFnE, null, options);
// → SELECT "name", "ca", "ca_e" FROM "compositions" WHERE TRUE AND (FALSE OR ("tsvector" @@ 'apples'))


// PRIMARY USECASE
// ---------------
async function mapFnDB(text, type, hint, from) {
  // ...
  // <do some database lookup>
  // ...
}
await convertToFormalSQL(/*  */, mapFnDB, null, options);
// → SELECT "name", "ca", "ca_e" FROM "compositions" WHERE TRUE AND (FALSE OR ("tsvector" @@ 'apples'))


// NOTES
// -----
// 1. Map function return value can be an expression array
// 2. For column, return multiple values to select multiple columns
// 3. But in expressions, only first return value is considered
// 4. Hints perform an operation on matching columns
// 5. Use hint to decide which columns to return
// 6. For table, returning expression will append to where
// 7. Return expression and table name for full association
// 8. Hint can be used in column text as "<hint>: <column text>"
// 9. Hint "all": all|each|every
// 10. Hint "sum": sum|gross|total|whole|aggregate
// 11. Hint "avg": avg|mid|par|mean|norm|center|centre|average|midpoint
```

<br>
<br>


[![](https://img.youtube.com/vi/yqO7wVBTuLw/maxresdefault.jpg)](https://www.youtube.com/watch?v=yqO7wVBTuLw)<br>
[![ORG](https://img.shields.io/badge/org-nodef-green?logo=Org)](https://nodef.github.io)
![](https://ga-beacon.deno.dev/G-RC63DPBH3P:SH3Eq-NoQ9mwgYeHWxu7cw/github.com/nodef/extra-pg-english)

[english query]: https://www.nexthink.com/blog/natural-language-interfaces-to-databases-nlidb/
[SQL SELECT]: https://www.postgresql.org/docs/10/static/sql-select.html
