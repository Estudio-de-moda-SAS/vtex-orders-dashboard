require('dotenv').config();
const { Client } = require('pg');
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const dup = await client.query(`
    SELECT date, store_id, COUNT(*) FROM sales_daily
    WHERE store_id = 'pilatos' AND date BETWEEN '2026-09-17' AND '2026-09-23'
    GROUP BY date, store_id HAVING COUNT(*) > 1
  `);
  console.log('duplicate (date,store_id) rows in sales_daily:', dup.rows);

  const rows = await client.query(`
    SELECT date, orders, units, sales FROM sales_daily
    WHERE store_id = 'pilatos' AND date BETWEEN '2026-09-17' AND '2026-09-23'
    ORDER BY date
  `);
  console.log('sales_daily rows:');
  console.table(rows.rows);
  const total = rows.rows.reduce((a, r) => a + Number(r.orders), 0);
  console.log('SUM(orders) [all statuses]:', total);

  const revenueRows = await client.query(`
    SELECT date, status, orders FROM sales_daily_by_status
    WHERE store_id = 'pilatos' AND date BETWEEN '2026-09-17' AND '2026-09-23'
    ORDER BY date, status
  `);
  console.log('sales_daily_by_status rows:');
  console.table(revenueRows.rows);

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
