import express from "express";
import cors from "cors";
import messageRoutes from "./routes/message.routes";
import "dotenv/config"; //This loads .env values into process.env when the backend starts.
import {checkOllama} from "./services/ai.service";

const app = express();
const PORT = 3000;

app.use(cors());//adds cross-origin response headers
app.use(express.json()); //parses incoming JSON request bodies

app.use(messageRoutes);
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "AI Assistant backend is running",
  });
});


app.get("/api/check-ollama", async (_req, res) => {
  try {
    const ollamaResponse = await checkOllama();
    res.json({
      status: "ok",
      message: ollamaResponse
    });
  }
  catch (error) {
    console.error("Error checking Ollama:", error);
    return res.status(500).json({
      error: "Failed to check Ollama",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});