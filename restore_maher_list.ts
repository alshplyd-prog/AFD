import { executePg, isPgConfigured } from "./src/db/dbExecutor.ts";
import { fileDb } from "./src/db/fileDb.ts";

async function restoreMaher() {
  console.log("Restoring Maher 2 list...");
  
  if (!isPgConfigured()) {
    console.error("PostgreSQL not configured.");
    return;
  }

  try {
    // 1. Check if Maher 2 exists in customer_lists
    const lists = await executePg("SELECT * FROM customer_lists WHERE name LIKE '%ماهر 2%'");
    let maherId = 'fund-2'; // Default ID from initialContracts
    
    if (lists.length === 0) {
      console.log("Maher 2 list not found, creating it...");
      await executePg(`
        INSERT INTO customer_lists (id, name, fund_id, description, order_index, receipt_template)
        VALUES ('fund-2', 'ماهر 2', 'fund-2', '', 1, 'template_1')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `);
    } else {
      maherId = lists[0].id;
      console.log(`Maher 2 list found with ID: ${maherId}`);
    }

    // 2. Remove from deleted_records if present
    await executePg("DELETE FROM deleted_records WHERE record_id = $1 OR record_id = 'fund-2'", [maherId]);
    console.log("Removed from deleted_records.");

    // 3. Ensure fund exists
    await executePg(`
      INSERT INTO cash_funds (id, name, balance, description, order_index)
      VALUES ('fund-2', 'ماهر 2', 50000, '', 1)
      ON CONFLICT (id) DO NOTHING
    `);
    await executePg("DELETE FROM deleted_records WHERE record_id = 'fund-2' AND table_name = 'cash_funds'");
    console.log("Ensured fund exists.");

    // 4. Update representative permissions
    // Give all admins access to 'all' or explicitly to this list
    await executePg(`
      UPDATE reps SET allowed_list_ids = '["all"]' WHERE role = 'admin' OR name LIKE '%ضياء%'
    `);
    console.log("Updated admin permissions.");

    console.log("Maher 2 list restoration complete.");
  } catch (err) {
    console.error("Restoration failed:", err);
  }
}

restoreMaher();
