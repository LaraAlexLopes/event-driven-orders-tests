import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { settings } from '../config';

const run = promisify(execFile);

export type Service = 'order-api' | 'payment-worker' | 'inventory-worker' | 'redis';

const compose = (...args: string[]) => run('docker', ['compose', '-f', settings.composeFile, ...args]);

export const services = {
  stop: (service: Service) => compose('stop', service),
  kill: (service: Service) => compose('kill', service),
  start: (service: Service) => compose('start', service),
};
