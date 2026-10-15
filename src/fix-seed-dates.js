
import db from "./database.js";

const update = db.transaction(() => {
  // Move only the original seeded expenses from August to October.
  // Keep September records and manually added October expenses unchanged.
  const result = db.prepare(`
    UPDATE transactions
    SET txn_date = '2026-10-' || substr(txn_date, 9, 2)
    WHERE substr(txn_date, 1, 7) = '2026-08'
      AND note IN (
        'Lunch',
        'Pizza',
        'Auto fare',
        'Clothes',
        'Internet bill',
        'Movie',
        'Rent payment',
        'Miscellaneous',
        'Breakfast',
        'Bus fare',
        'Dinner',
        'Household items'
      )
  `).run();

  return result.changes;
});

const changed = update();

console.log(`Updated ${changed} seeded transaction dates.`);

console.log("\nExpense counts by month:");
console.table(
  db.prepare(`
    SELECT
      substr(txn_date, 1, 7) AS month,
      COUNT(*) AS transaction_count,
      SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)
        AS total_expenses
    FROM transactions
    GROUP BY substr(txn_date, 1, 7)
    ORDER BY month
  `).all()
);

db.close();
