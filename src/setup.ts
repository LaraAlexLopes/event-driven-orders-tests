import { afterAll, beforeAll } from 'vitest';

import { database } from './clients/database';
import { createdSkus } from './data';
import { eventLog, stockQueue } from './system';

beforeAll(async () => {
  await eventLog.start();
});

afterAll(async () => {
  if (createdSkus.length > 0) await database.deleteProducts(createdSkus);
  await eventLog.stop();
  await stockQueue.close();
  await database.close();
});
