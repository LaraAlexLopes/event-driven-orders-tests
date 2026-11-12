export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const eventually = async <T>(
  check: () => Promise<T>,
  { timeout = 15_000, interval = 250 }: { timeout?: number; interval?: number } = {},
): Promise<T> => {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(interval);
    }
  }
};

export const consistently = async (
  check: () => Promise<void>,
  { duration = 3_000, interval = 250 }: { duration?: number; interval?: number } = {},
): Promise<void> => {
  const deadline = Date.now() + duration;
  while (Date.now() < deadline) {
    await check();
    await sleep(interval);
  }
};
