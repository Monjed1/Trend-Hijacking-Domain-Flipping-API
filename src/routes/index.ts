import { Router } from "express";
import { domainsController } from "../controllers/domains.controller";
import { healthController } from "../controllers/health.controller";
import { narrativesController } from "../controllers/narratives.controller";
import { pipelineController } from "../controllers/pipeline.controller";
import { trendsController } from "../controllers/trends.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const router = Router();

router.get("/health", asyncHandler(healthController.get));

router.post("/api/trends/collect", asyncHandler(trendsController.collect));
router.get("/api/trends/raw", asyncHandler(trendsController.listRaw));
router.get("/api/trends/raw/:id", asyncHandler(trendsController.getRawById));

router.post("/api/narratives/extract", asyncHandler(narrativesController.extract));
router.get("/api/narratives", asyncHandler(narrativesController.list));
router.get("/api/narratives/:id", asyncHandler(narrativesController.getById));
router.post("/api/narratives/:id/score", asyncHandler(narrativesController.score));

router.post("/api/domains/generate", asyncHandler(domainsController.generate));
router.post("/api/domains/generate-from-narrative/:id", asyncHandler(domainsController.generateFromNarrative));
router.get("/api/domains", asyncHandler(domainsController.list));
router.get("/api/domains/top", asyncHandler(domainsController.top));
router.get("/api/domains/buy-list", asyncHandler(domainsController.buyList));
router.get("/api/domains/watch-list", asyncHandler(domainsController.watchList));
router.get("/api/domains/rejected", asyncHandler(domainsController.rejected));
router.get("/api/domains/:id", asyncHandler(domainsController.getById));
router.post("/api/domains/check", asyncHandler(domainsController.check));
router.post("/api/domains/bulk-check", asyncHandler(domainsController.bulkCheck));

router.post("/api/pipeline/run", asyncHandler(pipelineController.run));
