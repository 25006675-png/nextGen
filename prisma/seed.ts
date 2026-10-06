// `npm run db:seed` / `npm run db:reset`: (re)load the 90-day sample kopitiam
// data, standing in for the history an ERP/POS connection would sync.

import { PrismaClient } from "@prisma/client";
import { importSampleData } from "../lib/demo-data";

const prisma = new PrismaClient();

async function main() {
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
