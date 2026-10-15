
import db from "./database.js";

console.log("\nLatest 5 transactions for Sahil:");

const transactions = db.prepare(`
  SELECT
    txn_id,
    amount,
    type,
    note,
    txn_date
  FROM transactions
  WHERE user_id = 1
  ORDER BY txn_id DESC
  LIMIT 5
`).all();

console.table(transactions);

console.log("\nTotal transactions for Sahil:");

const count = db.prepare(`
  SELECT COUNT(*) AS total
  FROM transactions
  WHERE user_id = 1
`).get();

console.log(count.total);

db.close();
