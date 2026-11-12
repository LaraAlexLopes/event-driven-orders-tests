import { randomUUID } from 'node:crypto';

import { Kafka, logLevel } from 'kafkajs';

import { config } from './config.js';

export const kafka = new Kafka({
  clientId: process.env.SERVICE_NAME ?? 'orders',
  brokers: config.kafkaBrokers,
  logLevel: logLevel.WARN,
  retry: { retries: 10, initialRetryTime: 300 },
});

const producer = kafka.producer({ allowAutoTopicCreation: false });
let connected;

export const ensureTopics = async () => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const missing = [
      { topic: config.topics.events, numPartitions: 3 },
      { topic: config.topics.deadLetter, numPartitions: 1 },
    ].filter(({ topic }) => !existing.has(topic));
    if (missing.length > 0) await admin.createTopics({ waitForLeaders: true, topics: missing });
  } catch (error) {
    if (error.type !== 'TOPIC_ALREADY_EXISTS') throw error;
  } finally {
    await admin.disconnect();
  }
};

export const createEvent = (type, orderId, data = {}) => ({
  eventId: randomUUID(),
  type,
  orderId,
  occurredAt: new Date().toISOString(),
  data,
});

export const publish = async (event, topic = config.topics.events) => {
  connected ??= producer.connect();
  await connected;
  await producer.send({ topic, messages: [{ key: event.orderId ?? null, value: JSON.stringify(event) }] });
};
