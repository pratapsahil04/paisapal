
import db from "./database.js";

console.log("\n--- PAISAPAL DATABASE TEST ---");

console.log("\nUsers:");
console.table(db.prepare(
  "SELECT * FROM users"
).all());

console.log("\nCategories:");
console.table(db.prepare(
  "SELECT * FROM categories"
).all());

console.log("\nTransaction count:");
console.log(
  db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count
);

console.log("\nTransactions by month and type:");
console.table(db.prepare(`
  SELECT
    substr(txn_date, 1, 7) AS month,
    type,
    COUNT(*) AS total
  FROM transactions
  GROUP BY month, type
  ORDER BY month, type
`).all());

console.log("\nBudget count:");
console.log(
  db.prepare("SELECT COUNT(*) AS count FROM budgets").get().count
);

console.log("\nBudget records:");
console.table(db.prepare(`
  SELECT
    u.name,
    c.name AS category,
    b.month,
    b.limit_amount
  FROM budgets b
  JOIN users u ON u.user_id = b.user_id
  JOIN categories c ON c.category_id = b.category_id
  ORDER BY u.user_id, c.category_id
`).all());

db.close();
