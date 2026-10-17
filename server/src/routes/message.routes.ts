import { Router } from "express";
const router = Router();
import { createAssistantReply } from "../services/ai.service";

router.post("/message",async (req, res) => {
  const { message } = req.body;
  if(!message || typeof message !== "string" || message.trim() === "" ) {
    return res.status(400).json({
      status: "error",
      message: "Invalid request body. 'message' field is required.",
    });
  }
  const reply = await createAssistantReply(message);
  res.json(
    {
    status: "ok",
    message: reply,
  });
})

export default router;