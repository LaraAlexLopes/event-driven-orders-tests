import { EventLog } from './clients/events';
import { StockQueue } from './clients/queue';

export const eventLog = new EventLog();
export const stockQueue = new StockQueue();
