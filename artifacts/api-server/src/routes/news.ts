import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, newsTable } from "@workspace/db";
import {
  CreateNewsBody,
  UpdateNewsParams,
  UpdateNewsBody,
  DeleteNewsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/news", async (_req, res): Promise<void> => {
  const news = await db.select().from(newsTable).orderBy(newsTable.createdAt);
  res.json(news.reverse());
});

router.post("/news", async (req, res): Promise<void> => {
  const parsed = CreateNewsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [article] = await db.insert(newsTable).values(parsed.data).returning();
  res.status(201).json(article);
});

router.patch("/news/:newsId", async (req, res): Promise<void> => {
  const params = UpdateNewsParams.safeParse({ newsId: parseInt(Array.isArray(req.params.newsId) ? req.params.newsId[0] : req.params.newsId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateNewsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(newsTable).set(parsed.data).where(eq(newsTable.id, params.data.newsId)).returning();
  if (!updated) {
    res.status(404).json({ error: "News article not found" });
    return;
  }
  res.json(updated);
});

router.delete("/news/:newsId", async (req, res): Promise<void> => {
  const params = DeleteNewsParams.safeParse({ newsId: parseInt(Array.isArray(req.params.newsId) ? req.params.newsId[0] : req.params.newsId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(newsTable).where(eq(newsTable.id, params.data.newsId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "News article not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
