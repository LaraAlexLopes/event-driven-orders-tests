import { randomUUID } from 'node:crypto';

import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';

import { runId, settings } from '../config';

export interface OrderEvent {
  eventId: string;
  type: string;
  orderId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface DeadLetter {
  reason: string;
  consumer: string;
  payload: string;
}

const kafka = new Kafka({ clientId: 'e2e-tests', brokers: settings.kafkaBrokers, logLevel: logLevel.NOTHING });

export class EventLog {
  private readonly events: OrderEvent[] = [];
  private readonly deadLetters: DeadLetter[] = [];
  private consumer?: Consumer;
  private producer?: Producer;

  async start(): Promise<void> {
    this.consumer = kafka.consumer({ groupId: `e2e-${runId}-${randomUUID()}` });
    this.producer = kafka.producer();
    await Promise.all([this.consumer.connect(), this.producer.connect()]);
    await this.consumer.subscribe({
      topics: [settings.topics.events, settings.topics.deadLetter],
      fromBeginning: true,
    });

    const joined = new Promise<void>(resolve => this.consumer?.on(this.consumer.events.GROUP_JOIN, () => resolve()));
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const value = message.value?.toString() ?? '';
        if (topic === settings.topics.deadLetter) this.deadLetters.push(JSON.parse(value));
        else {
          try {
            this.events.push(JSON.parse(value));
          } catch {
            return;
          }
        }
      },
    });
    await joined;
  }

  forOrder(orderId: string): OrderEvent[] {
    return this.events.filter(event => event.orderId === orderId);
  }

  typesFor(orderId: string): string[] {
    return this.forOrder(orderId).map(event => event.type);
  }

  deadLettersContaining(marker: string): DeadLetter[] {
    return this.deadLetters.filter(letter => letter.payload.includes(marker));
  }

  async publishRaw(value: string, key: string | null = null): Promise<void> {
    await this.producer?.send({ topic: settings.topics.events, messages: [{ key, value }] });
  }

  async stop(): Promise<void> {
    await Promise.all([this.consumer?.disconnect(), this.producer?.disconnect()]);
  }
}
