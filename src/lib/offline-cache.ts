import { openDB } from "idb";
import type { StudyTopic } from "./study-types";

const db = () =>
  openDB("study-shelf", 1, {
    upgrade(database) {
      database.createObjectStore("topics");
    },
  });

const cacheKey = (userId: string, topicId: string) => `${userId}:${topicId}`;

export async function cacheTopic(userId: string, topic: StudyTopic) {
  await (await db()).put("topics", topic, cacheKey(userId, topic.id));
}

export async function readCachedTopic(userId: string, topicId: string) {
  return (await (await db()).get("topics", cacheKey(userId, topicId))) as StudyTopic | undefined;
}

export async function listCachedTopics(userId: string) {
  const database = await db();
  const keys = await database.getAllKeys("topics");
  const values = await database.getAll("topics");
  return values.filter((_, index) => String(keys[index]).startsWith(`${userId}:`)) as StudyTopic[];
}
