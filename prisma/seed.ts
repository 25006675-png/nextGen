// `npm run db:seed` / `npm run db:reset`: (re)load the 90-day sample kopitiam
// data, standing in for the history an ERP/POS connection would sync.
// With --if-empty (used when the hosted app starts) it only loads into an empty database.

import { PrismaClient } from "@prisma/client";
import { importSampleData } from "../lib/demo-data";

const prisma = new PrismaClient();

async function main() {
  if (process.argv.includes("--if-empty") && (await prisma.item.count()) > 0) {
    console.log("Database already has data; not reloading the sample data.");
    return;
  }
  const s = await importSampleData(prisma);
  console.log(
    `Imported ${s.items} items, ${s.sales} sales days, ${s.purchases} purchases, ${s.wasteLogs} waste logs, ${s.pickups} BSF pickups (${s.from} to ${s.to}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
