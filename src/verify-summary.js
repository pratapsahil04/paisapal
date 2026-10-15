
import db from "./database.js";

const userId = 1;
const months = ["2026-08", "2026-09", "2026-10"];

for (const month of months) {
  console.log(`\n===== ${month} =====`);

  const summary = db.prepare(`
    SELECT
      c.name AS category,
      SUM(t.amount) AS spent
    FROM transactions t
    JOIN categories c
      ON c.category_id = t.category_id
    WHERE t.user_id = ?
      AND t.type = 'EXPENSE'
      AND substr(t.txn_date, 1, 7) = ?
    GROUP BY c.name
    ORDER BY spent DESC
  `).all(userId, month);

  const total = summary.reduce(
    (sum, row) => sum + row.spent,
    0
  );

  console.table(
    summary.map((row) => ({
      category: row.category,
      spent: row.spent,
      percentage: total
        ? `${((row.spent / total) * 100).toFixed(1)}%`
        : "0%",
    }))
  );

  console.log("Total expenses:", total);
}

console.log("\n===== OCTOBER BUDGETS =====");

const budgets = db.prepare(`
  SELECT c.name AS category, b.limit_amount
  FROM budgets b
  JOIN categories c
    ON c.category_id = b.category_id
  WHERE b.user_id = ? AND b.month = '2026-10'
  ORDER BY c.name
`).all(userId);

console.table(budgets);

db.close();
