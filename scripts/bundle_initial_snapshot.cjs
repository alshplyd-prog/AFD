const fs = require('fs');
const path = require('path');

try {
  const dataDir = path.join(__dirname, '..', 'data');
  const publicDir = path.join(__dirname, '..', 'public');

  const readFileSafe = (filename) => {
    try {
      const filePath = path.join(dataDir, filename);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {}
    return [];
  };

  const contracts = readFileSafe('contracts.json');
  const appointments = readFileSafe('appointments.json');
  const customerLists = readFileSafe('customer_lists.json');
  const funds = readFileSafe('funds.json');
  const reps = readFileSafe('reps.json');
  const inventory = readFileSafe('inventory_items.json');

  const snapshot = {
    timestamp: Date.now(),
    contracts,
    appointments,
    customerLists,
    funds,
    reps,
    inventory,
  };

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(path.join(publicDir, 'initial_snapshot.json'), JSON.stringify(snapshot, null, 2));
  console.log(`[Snapshot Bundler] Successfully bundled initial snapshot (${contracts.length} contracts, ${appointments.length} appointments).`);
} catch (err) {
  console.warn('[Snapshot Bundler] Warning:', err.message);
}
