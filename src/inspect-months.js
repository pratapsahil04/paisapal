
import db from "./database.js";

const rows = db.prepare(`
  SELECT
    t.txn_id,
    u.name AS user,
    t.txn_date,
    t.type,
    c.name AS category,
    t.amount,
    t.note
  FROM transactions t
  JOIN users u ON u.user_id = t.user_id
  JOIN categories c ON c.category_id = t.category_id
  WHERE substr(t.txn_date, 1, 7) IN (
    '2026-08', '2026-09', '2026-10'
  )
  ORDER BY t.txn_date, t.txn_id
`).all();

console.table(rows);
db.close();
