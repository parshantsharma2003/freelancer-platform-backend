import express from 'express';
import {
  getChats,
  getContractMessages,
  sendContractMessage
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getChats);
router.get('/:contractId/messages', getContractMessages);
router.post('/:contractId/messages', sendContractMessage);

export default router;
