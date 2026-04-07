import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentsRouter from "./tournaments";
import newsRouter from "./news";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentsRouter);
router.use(newsRouter);

export default router;
