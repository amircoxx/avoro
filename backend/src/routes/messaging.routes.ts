/** Maps the feature-gated messaging lifecycle and read resources. */
import { Router } from "express";
import {
  acceptMessageRequest,
  archiveConversation,
  blockConversation,
  createMessageRequest,
  declineMessageRequest,
  getConversations,
  getMessages,
  getMessagingStatus,
  getUnreadSummary,
  markMessagesRead,
  restoreConversation,
  syncMessages,
  unblockConversation
} from "../controllers/messaging.controller";
import { requireMessagingEnabled } from "../middleware/messaging-enabled.middleware";

export const messagingRouter = Router();
messagingRouter.get("/status", getMessagingStatus);
messagingRouter.use(requireMessagingEnabled);
messagingRouter.post("/requests", createMessageRequest);
messagingRouter.get("/conversations", getConversations);
messagingRouter.get("/unread-summary", getUnreadSummary);
messagingRouter.get("/sync", syncMessages);
messagingRouter.get("/conversations/:conversationId/messages", getMessages);
messagingRouter.post("/conversations/:conversationId/accept", acceptMessageRequest);
messagingRouter.post("/conversations/:conversationId/decline", declineMessageRequest);
messagingRouter.post("/conversations/:conversationId/read", markMessagesRead);
messagingRouter.post("/conversations/:conversationId/archive", archiveConversation);
messagingRouter.delete("/conversations/:conversationId/archive", restoreConversation);
messagingRouter.post("/blocks", blockConversation);
messagingRouter.delete("/blocks/:conversationId", unblockConversation);
