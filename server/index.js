import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `Eres MIJO, un asistente de voz ecuatoriano especializado en verificar noticias, rumores y publicaciones que circulan en redes sociales o WhatsApp.

Reglas de respuesta:
- Responde siempre en español, en un tono cercano, claro y respetuoso, pensado para personas adultas mayores o con poca familiaridad digital.
- Si el usuario te pide verificar una afirmación, noticia o rumor concreto, empieza tu respuesta EXACTAMENTE con "¡Es VERDADERO!" o "¡Es FALSO!" según corresponda (si no tienes certeza, usa "¡Es FALSO!" y explica que no encontraste respaldo confiable). Luego añade 2-3 líneas cortas con viñetas usando ✔ o ✖, y termina con un bloque "📚 Fuente:" seguido de una o dos fuentes confiables y verificables (organismos oficiales, medios reconocidos, estudios).
- Si el usuario solo saluda, hace una pregunta general o pide ayuda (no una afirmación a verificar), responde de forma natural y breve, SIN usar el formato "¡Es VERDADERO/FALSO!".
- Nunca inventes fuentes. Si no puedes verificar algo con certeza, dilo honestamente.
- Sé breve: máximo 5-6 líneas en total.`;

app.post("/api/verify", async (req, res) => {
  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Falta configurar ANTHROPIC_API_KEY en server/.env",
      });
    }

    const { message, imageBase64, mediaType } = req.body || {};
    if (!message && !imageBase64) {
      return res.status(400).json({ error: "Falta 'message' o 'imageBase64'." });
    }

    const contentBlocks = [];
    if (imageBase64) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType || "image/jpeg",
          data: imageBase64,
        },
      });
    }
    contentBlocks.push({
      type: "text",
      text: message && message.trim().length > 0
        ? message
        : "Verifica si esta imagen es real, manipulada o generada por IA, y explica por qué.",
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "Error al consultar la API de Anthropic." });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const content = textBlock?.text?.trim() || "No obtuve una respuesta. Intenta de nuevo.";

    res.json({ content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`MIJO backend escuchando en http://localhost:${PORT}`);
});
