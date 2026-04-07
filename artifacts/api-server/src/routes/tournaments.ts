import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tournamentsTable, participantsTable, matchesTable } from "@workspace/db";
import {
  CreateTournamentBody,
  GetTournamentParams,
  UpdateTournamentParams,
  UpdateTournamentBody,
  DeleteTournamentParams,
  ListMatchesParams,
  GenerateBracketParams,
  ArchiveTournamentParams,
  UpdateMatchParams,
  UpdateMatchBody,
  AddParticipantBody,
  RemoveParticipantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getTournamentWithDetails(id: number) {
  const tournament = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).then(r => r[0]);
  if (!tournament) return null;
  const participants = await db.select().from(participantsTable).where(eq(participantsTable.tournamentId, id));
  const matches = await db.select().from(matchesTable).where(eq(matchesTable.tournamentId, id)).then(rows => rows.sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber));
  return { ...tournament, participants, matches };
}

router.get("/tournaments", async (_req, res): Promise<void> => {
  const tournaments = await db.select().from(tournamentsTable).orderBy(tournamentsTable.createdAt);
  const result = await Promise.all(tournaments.map(t => getTournamentWithDetails(t.id)));
  res.json(result);
});

router.post("/tournaments", async (req, res): Promise<void> => {
  const parsed = CreateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tournament] = await db.insert(tournamentsTable).values(parsed.data).returning();
  const full = await getTournamentWithDetails(tournament.id);
  res.status(201).json(full);
});

router.get("/tournaments/:id", async (req, res): Promise<void> => {
  const params = GetTournamentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tournament = await getTournamentWithDetails(params.data.id);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.json(tournament);
});

router.patch("/tournaments/:id", async (req, res): Promise<void> => {
  const params = UpdateTournamentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(tournamentsTable).set(parsed.data).where(eq(tournamentsTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  const full = await getTournamentWithDetails(updated.id);
  res.json(full);
});

router.delete("/tournaments/:id", async (req, res): Promise<void> => {
  const params = DeleteTournamentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(tournamentsTable).where(eq(tournamentsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/tournaments/:id/matches", async (req, res): Promise<void> => {
  const params = ListMatchesParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const matches = await db.select().from(matchesTable).where(eq(matchesTable.tournamentId, params.data.id)).then(rows => rows.sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber));
  res.json(matches);
});

router.post("/tournaments/:id/generate-bracket", async (req, res): Promise<void> => {
  const params = GenerateBracketParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tournamentId = params.data.id;

  // Get participants
  const participants = await db.select().from(participantsTable).where(eq(participantsTable.tournamentId, tournamentId));
  if (participants.length < 2) {
    res.status(400).json({ error: "Need at least 2 participants" });
    return;
  }

  // Delete existing matches
  await db.delete(matchesTable).where(eq(matchesTable.tournamentId, tournamentId));

  // Shuffle participants
  const shuffled = [...participants].sort(() => Math.random() - 0.5);

  // Pad to next power of 2
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
  while (shuffled.length < nextPow2) {
    shuffled.push({ id: -1, name: "BYE", tournamentId, seed: null, createdAt: new Date() });
  }

  const newMatches: typeof matchesTable.$inferInsert[] = [];
  let currentRoundParticipants = shuffled;
  let round = 1;

  while (currentRoundParticipants.length > 1) {
    for (let i = 0; i < currentRoundParticipants.length; i += 2) {
      const p1 = currentRoundParticipants[i];
      const p2 = currentRoundParticipants[i + 1];
      const matchNumber = i / 2 + 1;

      const isBye = p1.id === -1 || p2.id === -1;

      newMatches.push({
        tournamentId,
        round,
        matchNumber,
        participant1Id: p1.id !== -1 ? p1.id : null,
        participant1Name: p1.id !== -1 ? p1.name : null,
        participant2Id: p2.id !== -1 ? p2.id : null,
        participant2Name: p2.id !== -1 ? p2.name : null,
        winnerId: isBye ? (p1.id !== -1 ? p1.id : p2.id) : null,
        winnerName: isBye ? (p1.id !== -1 ? p1.name : p2.name) : null,
        score1: null,
        score2: null,
        status: isBye ? "completed" : "pending",
      });
    }
    currentRoundParticipants = currentRoundParticipants.reduce<typeof shuffled>((acc, _, i) => {
      if (i % 2 === 0) acc.push({ id: -1, name: "TBD", tournamentId, seed: null, createdAt: new Date() });
      return acc;
    }, []);
    round++;
  }

  const insertedMatches = await db.insert(matchesTable).values(newMatches).returning();

  // Update tournament status to active
  await db.update(tournamentsTable).set({ status: "active" }).where(eq(tournamentsTable.id, tournamentId));

  res.json(insertedMatches.sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber));
});

router.post("/tournaments/:id/archive", async (req, res): Promise<void> => {
  const params = ArchiveTournamentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db.update(tournamentsTable).set({ status: "archived" }).where(eq(tournamentsTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  const full = await getTournamentWithDetails(updated.id);
  res.json(full);
});

router.patch("/matches/:matchId", async (req, res): Promise<void> => {
  const params = UpdateMatchParams.safeParse({ matchId: parseInt(Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(matchesTable).set(parsed.data).where(eq(matchesTable.id, params.data.matchId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(updated);
});

router.post("/participants", async (req, res): Promise<void> => {
  const parsed = AddParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [participant] = await db.insert(participantsTable).values(parsed.data).returning();
  res.status(201).json(participant);
});

router.delete("/participants/:participantId", async (req, res): Promise<void> => {
  const params = RemoveParticipantParams.safeParse({ participantId: parseInt(Array.isArray(req.params.participantId) ? req.params.participantId[0] : req.params.participantId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(participantsTable).where(eq(participantsTable.id, params.data.participantId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
