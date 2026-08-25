import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  Mic, MicOff, Send, Image, Link, Menu, X,
  Plus, BookOpen, Settings, ChevronRight, Sun,
  ThumbsUp, MessageCircle, Share2, Search, Bell, Home,
  Users, User, Lock, Trophy, RotateCcw, CheckCircle, HelpCircle,
  Volume2, ChevronLeft, Tv,
} from "lucide-react";
import logoMijo from "@/imports/logomijo_nofondo-2.png";
import imgAiGirl from "@/imports/image-5.png";
import imgTweet from "@/imports/image-6.png";

// ─── Real speech recognition (Web Speech API) ────────────────────────────────

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = "es-EC";
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}

// ─── Real text-to-speech (Web Speech API) ────────────────────────────────────

const VOICE_PRESETS: Record<AppSettings["voice"], { rate: number; pitch: number }> = {
  Presentador: { rate: 0.95, pitch: 1 },
  Jovial: { rate: 1.05, pitch: 1.25 },
  Guayaco: { rate: 0.9, pitch: 0.9 },
  Defecto: { rate: 1, pitch: 1 },
};

function speak(text: string, voiceName: AppSettings["voice"], onEnd?: () => void) {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const clean = text.replace(/^¡Es (FALSO|VERDADERO)!\s*/, "").replace(/[✔✖📚]/g, "");
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "es-ES";
  const preset = VOICE_PRESETS[voiceName] ?? VOICE_PRESETS.Defecto;
  utter.rate = preset.rate; utter.pitch = preset.pitch;
  const voices = window.speechSynthesis.getVoices();
  const esVoice = voices.find(v => v.lang?.toLowerCase().startsWith("es"));
  if (esVoice) utter.voice = esVoice;
  if (onEnd) utter.onend = onEnd;
  window.speechSynthesis.speak(utter);
}

// ─── Real backend call to MIJO (Anthropic-powered fact-check) ───────────────

// Base URL del backend: en desarrollo local queda vacío y usa el proxy de Vite (/api/...).
// En producción, defínela al compilar con VITE_API_BASE=https://tu-backend-desplegado.com
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

async function askMijo(message: string, imageFile?: File): Promise<string> {
  try {
    let imageBase64: string | undefined; let mediaType: string | undefined;
    if (imageFile) {
      mediaType = imageFile.type || "image/jpeg";
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
    }
    const res = await fetch(`${API_BASE}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, imageBase64, mediaType }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content as string;
  } catch (err) {
    return "⚠️ No pude conectarme con el servidor de MIJO. Verifica que el backend esté corriendo (npm run dev:server) y que tu ANTHROPIC_API_KEY esté configurada en server/.env.";
  }
}

function LogoImg({ dark, className = "", style }: { dark: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ isolation: "isolate", ...style }}>
      <img src={logoMijo} className="w-full h-full object-contain" alt="MIJO" />
    </div>
  );
}

type Role = "user" | "assistant";
type AppScreen = "social" | "listening" | "chat";
type GameId = "sudoku" | "wordsearch" | "crossword";

interface Message {
  id: string; role: Role; content: string; imageUrl?: string; isVoice?: boolean; voiceDuration?: number; timestamp: Date;
}


function getVerdict(content: string): "true" | "false" | null {
  const lower = content.toLowerCase();
  if (lower.includes("falsa") || lower.includes("falso")) return "false";
  if (lower.includes("verdadera") || lower.includes("verdadero") || lower.includes("sí es cierto") || lower.includes("si es cierto")) return "true";
  return null;
}

interface AppSettings {
  theme: "light" | "dark"; brightness: number;
  voice: "Presentador" | "Jovial" | "Guayaco" | "Defecto"; fontSize: "A" | "A+" | "A++";
}

const RESP_FALSO = `¡Es FALSO! No hay evidencia científica de que el agua con limón cure la diabetes o limpie la sangre.

✔ Puede ayudar a hidratarse.
✖ No reemplaza medicamentos ni controles médicos.

📚 Fuente:
Ministerio de Salud
OMS`;
const RESP_VERDADERO = `¡Es VERDADERO! Encontramos fuentes confiables que respaldan esta información.

✔ Ha sido verificada por medios y organismos reconocidos.
✔ Consulte fuentes adicionales si desea más detalles.

📚 Fuente:
Fuentes oficiales verificadas`;
const RESP_FALSO_GENERICO = `¡Es FALSO! No encontramos fuentes confiables que confirmen esta información.

✖ No tiene respaldo en fuentes oficiales.
✖ No la comparta sin verificar primero.

📚 Fuente:
Consulte fuentes confiables`;
const FONT_SIZE_MAP = { A: "17px", "A+": "20px", "A++": "24px" } as const;
const FREE_QUERIES = 5;

// ─── Game data ─────────────────────────────────────────────────────────────

const SUDOKU_SOLUTION = [
  [5,3,4,6,7,8,9,1,2],
  [6,7,2,1,9,5,3,4,8],
  [1,9,8,3,4,2,5,6,7],
  [8,5,9,7,6,1,4,2,3],
  [4,2,6,8,5,3,7,9,1],
  [7,1,3,9,2,4,8,5,6],
  [9,6,1,5,3,7,2,8,4],
  [2,8,7,4,1,9,6,3,5],
  [3,4,5,2,8,6,1,7,9],
];
const SUDOKU_PUZZLE = [
  [5,3,0,0,7,0,0,0,0],
  [6,0,0,1,9,5,0,0,0],
  [0,9,8,0,0,0,0,6,0],
  [8,0,0,0,6,0,0,0,3],
  [4,0,0,8,0,3,0,0,1],
  [7,0,0,0,2,0,0,0,6],
  [0,6,0,0,0,0,2,8,0],
  [0,0,0,4,1,9,0,0,5],
  [0,0,0,0,8,0,0,7,9],
];

const WS_GRID: string[][] = [
  ["P","Q","R","S","T","U","V","M"],
  ["V","E","R","D","A","D","X","I"],
  ["B","C","D","K","L","M","N","J"],
  ["G","H","A","P","Q","R","S","O"],
  ["W","X","T","F","A","L","S","O"],
  ["Y","Z","O","B","C","D","E","F"],
  ["F","U","E","N","T","E","G","H"],
  ["I","J","K","L","M","N","O","P"],
];
const WS_WORDS = [
  { word: "VERDAD", cells: [[1,0],[1,1],[1,2],[1,3],[1,4],[1,5]], color: "#5E9E6B" },
  { word: "FALSO",  cells: [[4,3],[4,4],[4,5],[4,6],[4,7]], color: "#D9534F" },
  { word: "MIJO",   cells: [[0,7],[1,7],[2,7],[3,7]], color: "#E98A15" },
  { word: "FUENTE", cells: [[6,0],[6,1],[6,2],[6,3],[6,4],[6,5]], color: "#4C7DFF" },
  { word: "DATO",   cells: [[2,2],[3,2],[4,2],[5,2]], color: "#9333ea" },
];

const CW_SOLUTION: (string | null)[][] = [
  [null,null,"F",null,null,null,null],
  ["P","R","U","E","B","A",null],
  [null,null,"E",null,null,null,null],
  ["M","E","N","T","I","R","A"],
  [null,null,"T",null,null,null,null],
  [null,null,"E",null,null,null,null],
];
const CW_NUMBERS: Record<string,number> = { "0,2": 2, "1,0": 1, "3,0": 3 };
const CW_WORDS = [
  { dir: "across" as const, row: 1, col: 0, length: 6, num: 1 },
  { dir: "down"   as const, row: 0, col: 2, length: 6, num: 2 },
  { dir: "across" as const, row: 3, col: 0, length: 7, num: 3 },
];
const CW_CLUES = {
  across: [
    { num: 1, clue: "Lo que necesitas antes de afirmar algo (6)" },
    { num: 3, clue: "Información que no es verdadera (7)" },
  ],
  down: [
    { num: 2, clue: "De donde viene la información confiable (6)" },
  ],
};

// ─── Exercises ─────────────────────────────────────────────────────────────

const EXERCISES = [
  {
    id: 1, image: imgAiGirl as string|null, whatsappText: null as string|null,
    imageAlt: "Niña llorando con un cachorro en una inundación",
    question: "¿Es esta una imagen generada con inteligencia artificial?",
    hint: "Observa los detalles de la piel, el agua y la iluminación.",
    correctIsYes: true,
    feedbackCorrect: "¡Excelente! 🎉 Efectivamente es una imagen generada por IA. Claves: la piel se ve demasiado perfecta, las gotas de lluvia tienen una distribución irreal, y la composición es demasiado dramática para una foto espontánea.",
    feedbackWrong: "¡Ojo! En realidad sí es una imagen generada por inteligencia artificial. Señales clave: textura perfecta de la piel, reflejos irreales del agua e iluminación ideal en una emergencia.",
  },
  {
    id: 2, image: imgTweet as string|null, whatsappText: null as string|null,
    imageAlt: "Publicación de Twitter/X sobre Jóvenes en Acción",
    question: "¿Puedes confiar en esta publicación de redes sociales?",
    hint: "Fíjate en quién la publica y si es una fuente oficial.",
    correctIsYes: false,
    feedbackCorrect: "¡Muy bien! 🎉 Aunque la información podría ser correcta, NO debes confiar ciegamente. El usuario no es una fuente oficial ni verificada. Siempre verifica en fuentes oficiales.",
    feedbackWrong: "¡Cuidado! Aunque la información podría ser verdadera, NO debes confiar en esta fuente sin verificar. Una cuenta no oficial puede mezclar datos correctos con errores o desinformación.",
  },
  {
    id: 3, image: null as string|null, whatsappText: "🔴 ¡URGENTE! El gobierno va a cortar el internet en 48 horas. Comparte este mensaje antes de que lo censuren. ¡AVISA A TODOS TUS CONTACTOS! 🔴",
    imageAlt: "",
    question: "¿Debes compartir este mensaje de WhatsApp?",
    hint: "Piensa: ¿por qué dice 'comparte antes de que lo censuren'?",
    correctIsYes: false,
    feedbackCorrect: "¡Muy bien! 🎉 No debes compartirlo. «Comparte antes de que lo censuren» es una táctica clásica de desinformación para crear urgencia y miedo. Siempre verifica con fuentes oficiales antes de reenviar.",
    feedbackWrong: "¡Cuidado! Aunque parece urgente, no debes compartirlo sin verificar. Crear miedo y urgencia es una táctica para que la gente comparta sin pensar. Busca siempre la información en fuentes oficiales.",
  },
];

const GAME_META: Record<GameId,{ title:string; emoji:string; desc:string }> = {
  sudoku:     { title: "Sudoku 9×9",      emoji: "🔢", desc: "Completa la cuadrícula con los números del 1 al 9." },
  wordsearch: { title: "Sopa de letras",  emoji: "🔤", desc: "Encuentra las 5 palabras ocultas en la cuadrícula." },
  crossword:  { title: "Crucigrama",      emoji: "✏️",  desc: "Resuelve el crucigrama sobre verificación de noticias." },
};
const GAME_ORDER: GameId[] = ["sudoku","wordsearch","crossword"];

// ─── Tutorial steps ─────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  { emoji: "👋", title: "¡Bienvenido a MIJO!", desc: "MIJO es tu asistente personal para saber si las noticias que ves en redes sociales son verdaderas o falsas. En este tutorial te explico todo paso a paso." },
  { emoji: "📱", title: "Paso 1: La red social", desc: "Al abrir MIJO verás una pantalla parecida a Facebook con noticias del día. Cuando veas una noticia sospechosa, toca en cualquier parte de la pantalla para activar a MIJO." },
  { emoji: "🔮", title: "Paso 2: El orbe de MIJO", desc: "Al tocar aparecerá un orbe de colores. Eso significa que MIJO está listo. Toca el orbe de nuevo para abrir el chat de verificación." },
  { emoji: "🎙️", title: "Paso 3: Habla o escribe", desc: "En el chat puedes presionar el micrófono y hablar, o usar el cuadro de texto para escribir la noticia que quieres verificar." },
  { emoji: "🖼️", title: "Paso 4: Adjunta una imagen", desc: "¿Ves una foto sospechosa? Toca el ícono de imagen 🖼 en la barra de texto para adjuntarla. MIJO analizará si parece real o fue creada con inteligencia artificial." },
  { emoji: "🔗", title: "Paso 5: Verifica un enlace", desc: "También puedes tocar el ícono de enlace 🔗 y pegar el link de una noticia o página web. MIJO revisará si la fuente es confiable antes de que la compartas." },
  { emoji: "✅", title: "Paso 6: El resultado", desc: "MIJO te dirá si la noticia es VERDADERA ✓ o FALSA ✗, con una explicación clara. Puedes tocar el botón 🔊 para escuchar la respuesta." },
  { emoji: "☰",  title: "El menú lateral", desc: "Toca el ícono ☰ en la esquina superior izquierda para acceder a nueva consulta, aprendizaje y configuración de pantalla." },
  { emoji: "🎮", title: "Zona de Aprendizaje", desc: "Practica identificar noticias falsas e imágenes de IA con ejercicios. ¡Responde correctamente y desbloqueas juegos como Sudoku y Sopa de letras!" },
  { emoji: "🚀", title: "¡Listo para empezar!", desc: "Ya sabes cómo usar MIJO. Puedes volver a este tutorial desde el menú lateral cuando quieras. ¡Ante la duda, verifica antes de compartir!" },
];

const LEARN_TOUR_STEPS: Array<{ targetId: string | null; emoji: string; title: string; desc: string; placement: "below" | "above" | "center" }> = [
  { targetId: null,                   emoji: "📚", title: "Zona de Aprendizaje",   desc: "Aquí puedes practicar cómo identificar noticias falsas e imágenes creadas con IA. Completa los ejercicios para desbloquear juegos.",             placement: "center" },
  { targetId: "learn-tab-exercises",  emoji: "📋", title: "Pestaña Ejercicios",    desc: "En esta pestaña encontrarás casos reales para analizar: noticias, imágenes o mensajes de WhatsApp. Lee bien antes de responder.",                  placement: "below"  },
  { targetId: "learn-exercise-card",  emoji: "🔍", title: "El ejercicio",          desc: "Observa con atención la noticia, imagen o mensaje. Fíjate en los detalles: la fuente, el lenguaje y si la información parece exagerada.",           placement: "below"  },
  { targetId: "learn-answer-btns",    emoji: "✅", title: "Responde Sí o No",      desc: "Toca Sí si crees que la información es verdadera, o No si crees que es falsa. MIJO te dirá si acertaste y te explicará por qué.",                    placement: "above"  },
  { targetId: "learn-tab-games",      emoji: "🎮", title: "Pestaña Juegos",        desc: "Por cada respuesta correcta desbloqueas un juego. ¡Completa los ejercicios para acceder a Sudoku, Sopa de letras y Crucigrama!",                    placement: "below"  },
  { targetId: null,                   emoji: "🚀", title: "¡Ya sabes cómo usar esta sección!", desc: "Puedes volver a este tutorial en cualquier momento tocando el botón ❓ en la esquina superior derecha.",                                  placement: "center" },
];

const TOUR_STEPS: Array<{ targetId: string | null; emoji: string; title: string; desc: string; placement: "below" | "above" | "center" }> = [
  { targetId: "tour-menu-btn",       emoji: "☰",   title: "Menú de MIJO",          desc: "Toca aquí para acceder al historial, zona de aprendizaje y configuración de pantalla.",                                               placement: "below"  },
  { targetId: "tour-query-counter",  emoji: "🔢",  title: "Consultas gratuitas",   desc: "Este contador muestra cuántas consultas gratuitas te quedan hoy. Cuando se agoten, puedes ver un anuncio para seguir usando MIJO.",    placement: "below"  },
  { targetId: "tour-mic-btn",        emoji: "🎙️", title: "Micrófono",             desc: "Presiona aquí y habla. MIJO te escucha y verifica la noticia que le describes con tu voz.",                                            placement: "above"  },
  { targetId: "tour-img-btn",        emoji: "🖼️", title: "Adjuntar imagen",        desc: "Toca este ícono para enviar una foto sospechosa. MIJO analiza si parece real o fue creada con inteligencia artificial.",              placement: "above"  },
  { targetId: "tour-link-btn",       emoji: "🔗",  title: "Verificar un enlace",   desc: "Pega aquí el link de una noticia o página web. MIJO revisará si la fuente es confiable antes de que la compartas.",                   placement: "above"  },
  { targetId: "tour-text-area",      emoji: "✏️", title: "Cuadro de texto",        desc: "Escribe aquí la noticia que quieres verificar, o pega el texto directamente desde tu teléfono.",                                       placement: "above"  },
  { targetId: null,                  emoji: "🚀",  title: "¡Ya sabes usar MIJO!",  desc: "Puedes repetir este tutorial desde el menú lateral cuando quieras. Recuerda: ¡ante la duda, verifica antes de compartir!",            placement: "center" },
];

// ─── CSS ───────────────────────────────────────────────────────────────────

const globalCSS = `
  @keyframes wave {
    from { transform: scaleY(0.4); }
    to   { transform: scaleY(1.8); }
  }
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40%           { transform: translateY(-6px); opacity: 1; }
  }
  @keyframes pulse-ring {
    0%   { transform: scale(1);   opacity: 0.5; }
    100% { transform: scale(1.7); opacity: 0; }
  }
  @keyframes fadein {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadein-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes orb-rise {
    from { transform: translateY(160px) scale(0.4); opacity: 0; }
    to   { transform: translateY(0) scale(1); opacity: 1; }
  }
  @keyframes orb-spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes orb-pulse {
    0%, 100% { transform: scale(1);    opacity: 0.85; }
    50%       { transform: scale(1.08); opacity: 1; }
  }
  @keyframes orb-ring {
    0%   { transform: scale(1);   opacity: 0.6; }
    100% { transform: scale(1.9); opacity: 0; }
  }
  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes text-rise {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes unlock-pop {
    0%   { transform: scale(0.6); opacity: 0; }
    70%  { transform: scale(1.12); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes progress-bar {
    from { width: 100%; }
    to   { width: 0%; }
  }
  .msg-enter    { animation: fadein 0.25s ease both; }
  .unlock-pop   { animation: unlock-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
  .slide-in     { animation: slide-in 0.35s ease both; }
  .num-btn      { transition: transform 0.1s, box-shadow 0.1s; }
  .num-btn:active { transform: scale(0.93); }
  ::-webkit-scrollbar { width: 0; background: transparent; }
  .chat-scroll::-webkit-scrollbar { width: 6px; }
  .chat-scroll::-webkit-scrollbar-track { background: transparent; }
  .chat-scroll::-webkit-scrollbar-thumb { border-radius: 10px; background: rgba(128,128,128,0.3); }
  .chat-scroll { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.3) transparent; }
  .cw-cell:focus { outline: none; }
`;

// ─── Paywall Modal ──────────────────────────────────────────────────────────

function PaywallModal({ onWatchAd, onClose }: { onWatchAd: () => void; onClose: () => void }) {
  const [watching, setWatching] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const accent = "#E98A15";

  const handleWatch = () => {
    setWatching(true);
    setCountdown(5);
    const iv = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(iv); setTimeout(onWatchAd, 300); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", animation: "overlay-in 0.25s ease both" }}>
      <style>{globalCSS}</style>
      <div className="w-full rounded-t-3xl flex flex-col" style={{ background: "#FAF7F2", maxHeight: "80vh", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        <div className="flex-shrink-0 px-6 pt-6 pb-4 text-center">
          <div style={{ fontSize: "56px", lineHeight: 1, marginBottom: "12px" }}>⏰</div>
          <h2 className="font-bold" style={{ color: "#1a1206", fontSize: "22px" }}>Consultas gratuitas agotadas</h2>
          <p className="mt-2 leading-relaxed" style={{ color: "#5c4f3d", fontSize: "16px" }}>
            Has usado tus <strong>{FREE_QUERIES} consultas gratuitas</strong> del día. Para seguir verificando noticias, acepta ver una breve publicidad.
          </p>
        </div>

        {watching ? (
          <div className="flex-shrink-0 mx-6 mb-5 rounded-2xl overflow-hidden" style={{ border: "2px solid #d4c4a8" }}>
            <div className="flex items-center justify-between px-4 py-2" style={{ background: "#f5f0e8", borderBottom: "1px solid #d4c4a8" }}>
              <span className="font-bold uppercase tracking-wider" style={{ color: "#9a8a7a", fontSize: "11px" }}>PUBLICIDAD</span>
              <span className="font-bold" style={{ color: accent, fontSize: "14px" }}>Cierra en {countdown}s</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 py-8" style={{ background: "linear-gradient(135deg,#fff9ee,#fde4b8)" }}>
              <Tv size={40} color={accent} />
              <p className="font-bold" style={{ color: "#5c3d10", fontSize: "17px" }}>Anuncio en reproducción…</p>
              <div className="flex gap-1 items-end">
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ width: "5px", background: accent, borderRadius: "3px", animation: `wave 0.6s ease-in-out ${i*0.1}s infinite alternate`, height: `${8+i*4}px` }} />
                ))}
              </div>
            </div>
            <div style={{ height: "6px", background: "#e6c87a" }}>
              <div style={{ height: "100%", background: accent, animation: `progress-bar ${5}s linear both`, borderRadius: "0 3px 3px 0" }} />
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 flex flex-col gap-3 px-6 pb-8">
            <button onClick={handleWatch}
              className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-bold transition-all active:scale-95"
              style={{ background: accent, color: "#fff", fontSize: "18px", minHeight: "64px", boxShadow: `0 4px 20px ${accent}55` }}
            >
              <Tv size={22} /> Ver publicidad (5s) y continuar
            </button>
            <button onClick={onClose}
              className="w-full py-4 rounded-2xl font-semibold transition-all active:scale-95"
              style={{ background: "#f5f0e8", border: "1.5px solid #d4c4a8", color: "#5c4f3d", fontSize: "17px", minHeight: "56px" }}
            >
              Ahora no
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Social Screen ──────────────────────────────────────────────────────────

function SocialScreen({ onTap }: { onTap: () => void }) {
  const stories = [
    { name: "Tu historia", bg: "#4267B2", initials: "+" },
    { name: "Carlos M.",   bg: "#E98A15", initials: "CM" },
    { name: "Ana P.",      bg: "#D9534F", initials: "AP" },
    { name: "Luis R.",     bg: "#5E9E6B", initials: "LR" },
  ];
  return (
    <div className="size-full flex flex-col overflow-hidden select-none cursor-pointer"
      style={{ background: "#f0f2f5", fontFamily: "'Plus Jakarta Sans',sans-serif" }} onClick={onTap}
    >
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-2 pb-1" style={{ background: "#fff" }}>
        <span className="font-bold" style={{ color: "#1c1e21", fontSize: "14px" }}>2:04</span>
        <div className="flex gap-1"><div className="w-3 h-2 rounded-sm" style={{ background: "#1c1e21" }} /><div className="w-1 h-2 rounded-sm" style={{ background: "#1c1e21" }} /></div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e6eb" }}>
        <span className="text-2xl font-black" style={{ color: "#1877f2", fontFamily: "Georgia, serif" }}>facebook</span>
        <div className="flex gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#e4e6eb" }}><Search size={20} color="#1c1e21" /></button>
          <button className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#e4e6eb" }}><MessageCircle size={20} color="#1c1e21" /></button>
        </div>
      </div>
      <div className="flex-shrink-0 flex border-b" style={{ background: "#fff", borderColor: "#e4e6eb" }}>
        {[Home, MessageCircle, Users, Bell, User].map((Icon, i) => (
          <button key={i} className="flex-1 flex items-center justify-center py-3" style={{ borderBottom: i === 0 ? "3px solid #1877f2" : "3px solid transparent" }}>
            <Icon size={24} color={i === 0 ? "#1877f2" : "#606770"} />
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-2 px-3 py-3 overflow-x-auto" style={{ background: "#fff", marginBottom: "8px" }}>
          {stories.map((s, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1">
              <div className="w-16 h-20 rounded-xl flex items-end justify-center pb-1 relative overflow-hidden"
                style={{ background: s.bg, border: i === 0 ? "none" : "3px solid #1877f2" }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold absolute"
                  style={{ fontSize: "11px", background: i === 0 ? "#1877f2" : s.bg, top: 4, left: "50%", transform: "translateX(-50%)", border: "2px solid #fff" }}
                >{s.initials}</div>
                <span className="text-white font-semibold text-center leading-tight px-0.5" style={{ fontSize: "9px" }}>{s.name}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mx-0 px-4 py-3 flex items-center gap-3" style={{ background: "#fff", marginBottom: "8px", borderTop: "1px solid #e4e6eb", borderBottom: "1px solid #e4e6eb" }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ background: "#4267B2", fontSize: "15px" }}>T</div>
          <div className="flex-1 px-4 py-2.5 rounded-full" style={{ background: "#f0f2f5", color: "#606770", fontSize: "15px" }}>¿Qué estás pensando?</div>
        </div>
        <div style={{ background: "#fff", marginBottom: "8px" }}>
          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ background: "#E98A15", fontSize: "15px" }}>SR</div>
            <div>
              <p className="font-bold" style={{ color: "#1c1e21", fontSize: "15px" }}>Salud y Remedios Naturales 🌿</p>
              <p style={{ color: "#606770", fontSize: "13px" }}>hace 2 horas · 🌐</p>
            </div>
            <div className="ml-auto font-bold text-xl" style={{ color: "#606770" }}>···</div>
          </div>
          <div className="px-4 pb-3">
            <p className="leading-relaxed font-semibold" style={{ color: "#1c1e21", fontSize: "15px" }}>
              🍋 ¡INCREÍBLE! Tómate un vaso de agua tibia con limón en ayunas todas las mañanas y te limpia la sangre, te baja la presión y te cura la diabetes. ¡Comparte con tus seres queridos!
            </p>
          </div>
          <div className="w-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#fff9ee,#fde4b8)", height: "180px" }}>
            <div className="text-center">
              <div className="text-6xl mb-2">🍋</div>
              <p className="font-bold" style={{ color: "#7a4a00", fontSize: "15px" }}>AGUA TIBIA CON LIMÓN</p>
              <p className="mt-1" style={{ color: "#a06000", fontSize: "13px" }}>¿El remedio que lo cura todo?</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #e4e6eb" }}>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: "14px" }}>👍❤️😮</span>
              <span style={{ color: "#606770", fontSize: "13px" }}>18.3K</span>
            </div>
            <span style={{ color: "#606770", fontSize: "13px" }}>5.741 comentarios · 9.2K compartidos</span>
          </div>
          <div className="flex px-2 py-1.5">
            {[{ icon: ThumbsUp, label: "Me gusta" }, { icon: MessageCircle, label: "Comentar" }, { icon: Share2, label: "Compartir" }].map(({ icon: Icon, label }) => (
              <button key={label} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg">
                <Icon size={18} color="#606770" />
                <span className="font-semibold" style={{ color: "#606770", fontSize: "14px" }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="text-center py-8">
          <p style={{ color: "#b0b3b8", fontSize: "14px" }}>Toca en cualquier parte para activar MIJO</p>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-around px-6 py-3" style={{ background: "#fff", borderTop: "1px solid #e4e6eb" }}>
        <div className="w-7 h-1 rounded-full" style={{ background: "#1c1e21" }} />
      </div>
    </div>
  );
}

// ─── Orb ───────────────────────────────────────────────────────────────────

function MijoOrb({ onTap }: { onTap: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 30); return () => clearTimeout(t); }, []);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end cursor-pointer"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)", animation: "overlay-in 0.35s ease both", zIndex: 10 }}
      onClick={onTap}
    >
      <div className="mb-6 text-center px-6" style={{ animation: show ? "text-rise 0.5s ease 0.5s both" : "none", opacity: 0 }}>
        <p className="text-white font-semibold" style={{ fontSize: "22px", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>¡Hola! Mijo te está escuchando…</p>
        <p className="text-white/60 mt-1" style={{ fontSize: "16px" }}>Toca de nuevo para abrir MIJO</p>
      </div>
      <div className="mb-12 relative flex items-center justify-center"
        style={{ animation: show ? "orb-rise 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both" : "none", opacity: 0 }}
      >
        {[0,0.8,1.6].map((delay, i) => (
          <div key={i} className="absolute rounded-full"
            style={{ width: "200px", height: "200px", background: i % 2 === 0 ? "radial-gradient(circle, rgba(245,166,35,0.15) 0%, transparent 80%)" : "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)", animation: `orb-ring 2.4s ease-out ${delay}s infinite` }}
          />
        ))}
        <div className="relative rounded-full flex items-center justify-center"
          style={{ width: "130px", height: "130px", animation: "orb-pulse 2.5s ease-in-out infinite", boxShadow: "0 0 60px rgba(245,166,35,0.6), 0 0 120px rgba(245,166,35,0.25), 0 0 30px rgba(99,102,241,0.4)" }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, #f5a623, #E98A15, #6366f1, #06b6d4, #f5a623)", animation: "orb-spin 4s linear infinite", filter: "blur(8px)", opacity: 0.9 }} />
          <div className="absolute rounded-full" style={{ width: "88px", height: "88px", background: "radial-gradient(circle at 40% 35%, #fff9ee, #f5a623 40%, #E98A15 70%, #9333ea)", zIndex: 1 }} />
          <div className="absolute rounded-full" style={{ width: "30px", height: "20px", background: "radial-gradient(circle, rgba(255,255,255,0.8), transparent)", top: "20px", left: "26px", zIndex: 2 }} />
        </div>
        <div className="absolute flex items-end justify-center gap-1" style={{ bottom: "-30px" }}>
          {[0,1,2,3,4,5,6].map((i) => (
            <div key={i} className="w-1.5 rounded-full" style={{ background: "#f5a623", animation: `wave 0.6s ease-in-out ${i*0.09}s infinite alternate`, height: `${10 + Math.sin(i*0.8)*6}px`, opacity: 0.85 }} />
          ))}
        </div>
      </div>
      <div className="h-16" />
    </div>
  );
}

// ─── WaveAnimation ──────────────────────────────────────────────────────────

function WaveAnimation({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 h-7">
      {[0,1,2,3,4].map((i) => (
        <div key={i} className="w-1.5 rounded-full transition-all duration-300"
          style={{ background: color, height: active ? `${14 + Math.sin(i*0.9)*8}px` : "6px", animation: active ? `wave 0.7s ease-in-out ${i*0.1}s infinite alternate` : "none" }}
        />
      ))}
    </div>
  );
}

// ─── Bubbles ───────────────────────────────────────────────────────────────

function VoiceBubble({ msg }: { msg: Message }) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dur = msg.voiceDuration ?? 4;
  const bars = [0.4,0.7,1,0.6,0.9,0.5,1,0.8,0.45,0.75,0.95,0.55,0.8,0.65,0.4,0.9,1,0.5];
  const toggle = () => {
    if (playing) { setPlaying(false); if (timerRef.current) clearTimeout(timerRef.current); }
    else { setPlaying(true); timerRef.current = setTimeout(() => setPlaying(false), dur * 1000); }
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (
    <div className="flex justify-end mb-5 msg-enter">
      <div className="max-w-[82%] flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl rounded-tr-sm"
          style={{ background: "linear-gradient(135deg,#4C7DFF,#3a6be0)", boxShadow: "0 2px 14px rgba(76,125,255,0.3)", minWidth: "220px" }}
        >
          <button onClick={toggle} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
            style={{ background: "rgba(255,255,255,0.22)" }}
          >
            {playing
              ? <div className="w-3 h-3 rounded-sm bg-white" />
              : <div style={{ width:0,height:0,borderTop:"7px solid transparent",borderBottom:"7px solid transparent",borderLeft:"12px solid white",marginLeft:"2px" }} />
            }
          </button>
          <div className="flex-1 flex items-center gap-[2px]" style={{ height: "28px" }}>
            {bars.map((h, i) => (
              <div key={i} style={{ width:"3px", borderRadius:"2px", background: playing?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.55)", height:`${h*100}%`, animation: playing?`wave 0.6s ease-in-out ${i*0.04}s infinite alternate`:"none", transition:"background 0.2s" }} />
            ))}
          </div>
          <span className="font-medium flex-shrink-0" style={{ color:"rgba(255,255,255,0.8)", fontSize:"13px" }}>{dur}s</span>
        </div>
        <span className="px-1" style={{ color: "#5c4f3d", fontSize: "13px" }}>{msg.timestamp.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
    </div>
  );
}

function UserBubble({ msg }: { msg: Message }) {
  if (msg.isVoice) return <VoiceBubble msg={msg} />;
  return (
    <div className="flex justify-end mb-5 msg-enter">
      <div className="max-w-[82%] flex flex-col items-end gap-1.5">
        <div className="rounded-2xl rounded-tr-sm leading-relaxed overflow-hidden"
          style={{ background: "linear-gradient(135deg,#4C7DFF,#3a6be0)", color: "#fff", boxShadow: "0 2px 14px rgba(76,125,255,0.3)" }}
        >
          {msg.imageUrl && <img src={msg.imageUrl} alt="Imagen adjunta" className="w-full max-w-[280px] object-cover" style={{ maxHeight: "220px", display: "block" }} />}
          {msg.content && <p className="px-5 py-4">{msg.content}</p>}
        </div>
        <span className="px-1" style={{ color: "#5c4f3d", fontSize: "13px" }}>{msg.timestamp.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
    </div>
  );
}

function PlayButton({ content, voice = "Defecto" }: { content: string; voice?: AppSettings["voice"] }) {
  const [playing, setPlaying] = useState(false);
  const accent = "#E98A15";
  const toggle = () => {
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    setPlaying(true);
    speak(content, voice, () => setPlaying(false));
  };
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);
  return (
    <button onClick={toggle} title={playing ? "Detener" : "Escuchar respuesta"}
      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all active:scale-95 flex-shrink-0"
      style={{ background: playing ? accent : "#fff3dc", border: `1.5px solid ${playing ? accent : "#e6c87a"}`, color: playing ? "#fff" : "#7a4a00", boxShadow: playing ? `0 2px 12px ${accent}55` : "none", minHeight: "38px" }}
    >
      <Volume2 size={17} />
      <div className="flex items-end gap-[3px]" style={{ height: "16px" }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width: "3px", borderRadius: "2px", background: playing ? "#fff" : "#e6a830", height: playing ? `${6 + Math.sin(i * 1.1) * 5}px` : "5px", animation: playing ? `wave 0.55s ease-in-out ${i * 0.1}s infinite alternate` : "none", transition: "height 0.2s" }} />
        ))}
      </div>
    </button>
  );
}

function AssistantBubble({ msg, dark, voice = "Defecto" }: { msg: Message; dark: boolean; voice?: AppSettings["voice"] }) {
  const verdict = getVerdict(msg.content);
  const borderColor = verdict === "false" ? "#D9534F" : verdict === "true" ? "#5E9E6B" : "rgba(0,0,0,0.10)";
  return (
    <div className="flex items-start gap-3 mb-5 msg-enter">
      <LogoImg dark={dark} className="w-12 h-12 flex-shrink-0 mt-1" />
      <div className="max-w-[82%] flex flex-col gap-1.5">
        <div className="px-5 py-4 rounded-2xl rounded-tl-sm leading-relaxed"
          style={{ background: "#fff", color: "#1a1206", border: `${verdict ? "2.5px" : "1px"} solid ${borderColor}`, boxShadow: verdict === "false" ? "0 2px 18px rgba(224,82,82,0.22)" : verdict === "true" ? "0 2px 18px rgba(34,197,94,0.22)" : "0 2px 12px rgba(0,0,0,0.08)" }}
        >
          {verdict && (
            <span className="inline-block font-bold uppercase tracking-wide px-3 py-1.5 rounded-full mb-3"
              style={{ fontSize: "13px", background: verdict === "false" ? "rgba(224,82,82,0.14)" : "rgba(34,197,94,0.14)", color: verdict === "false" ? "#b84340" : "#3d7a4a" }}
            >
              {verdict === "false" ? "❌  FALSO" : "✓  VERDADERO"}
            </span>
          )}
          <p style={{ whiteSpace: "pre-wrap" }}>{msg.content.replace(/^¡Es (FALSO|VERDADERO)!\s*/,"")}</p>
        </div>
        <div className="flex items-center gap-2 px-1">
          <span style={{ color: "#5c4f3d", fontSize: "13px" }}>{msg.timestamp.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
          <PlayButton content={msg.content} voice={voice} />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ dark }: { dark: boolean }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <LogoImg dark={dark} className="w-12 h-12 flex-shrink-0 mt-1" />
      <div className="px-5 py-4 rounded-2xl rounded-tl-sm" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.10)" }}>
        <div className="flex gap-1.5 items-center h-6">
          {[0,1,2].map((i) => <div key={i} className="w-3 h-3 rounded-full" style={{ background: "#5c4f3d", animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Tutorial ──────────────────────────────────────────────────────────────

function OnboardingTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const accent = "#E98A15";
  const total = TUTORIAL_STEPS.length;
  const cur = TUTORIAL_STEPS[step];
  const isLast = step === total - 1;

  const handlePlay = () => {
    if (playing) return;
    setPlaying(true);
    setTimeout(() => setPlaying(false), 2800);
  };
  const goNext = () => { setPlaying(false); if (isLast) onClose(); else setStep(s => s + 1); };
  const goPrev = () => { setPlaying(false); if (step > 0) setStep(s => s - 1); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#FAF7F2", fontFamily: "'Plus Jakarta Sans',sans-serif", animation: "overlay-in 0.3s ease both" }}>
      <style>{globalCSS}</style>
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl font-semibold" style={{ color: "#5c4f3d", background: "rgba(0,0,0,0.06)", fontSize: "16px" }}>Saltar</button>
        <span className="font-bold" style={{ color: "#5c4f3d", fontSize: "15px" }}>{step + 1} / {total}</span>
      </div>
      <div className="flex-shrink-0 flex justify-center gap-1.5 px-5 py-3">
        {TUTORIAL_STEPS.map((_, i) => (
          <div key={i} style={{ height: "8px", borderRadius: "4px", background: i <= step ? accent : "#d4c4a8", width: i === step ? "24px" : "8px", transition: "all 0.35s" }} />
        ))}
      </div>
      <div className="flex-1 overflow-y-auto chat-scroll flex flex-col items-center justify-center px-8 gap-5 text-center slide-in" key={step}>
        <div style={{ fontSize: "80px", lineHeight: 1 }}>{cur.emoji}</div>
        <h2 className="font-bold leading-tight" style={{ color: "#1a1206", fontSize: "24px", maxWidth: "320px" }}>{cur.title}</h2>
        <p className="leading-relaxed" style={{ color: "#5c4f3d", fontSize: "17px", maxWidth: "340px" }}>{cur.desc}</p>
        <div className="flex flex-col items-center gap-3 mt-1">
          <button onClick={handlePlay}
            className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-semibold transition-all active:scale-95"
            style={{ background: playing ? accent : "#fff3dc", border: `2px solid ${playing ? accent : "#e6c87a"}`, color: playing ? "#fff" : "#7a4a00", fontSize: "17px", boxShadow: playing ? `0 0 24px ${accent}66` : "none", animation: playing ? "orb-pulse 0.9s ease-in-out infinite" : "none" }}
          >
            <Volume2 size={22} />
            {playing ? "Reproduciendo…" : "🔊 Escuchar"}
          </button>
          {playing && (
            <div className="flex gap-1 items-end">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ width: "5px", background: accent, borderRadius: "3px", animation: `wave 0.5s ease-in-out ${i*0.08}s infinite alternate`, height: `${8 + i*3}px` }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex gap-3 px-5 pb-8 pt-4">
        {step > 0 && (
          <button onClick={goPrev} className="flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all active:scale-95"
            style={{ flex: 1, minHeight: "64px", background: "#f5f0e8", border: "1.5px solid #d4c4a8", color: "#5c4f3d", fontSize: "17px" }}
          >
            <ChevronLeft size={22} /> Anterior
          </button>
        )}
        <button onClick={goNext} className="flex items-center justify-center gap-2 rounded-2xl font-bold transition-all active:scale-95"
          style={{ flex: 2, minHeight: "64px", background: accent, color: "#fff", fontSize: "18px", boxShadow: `0 4px 20px ${accent}55` }}
        >
          {isLast ? "¡Empezar! 🚀" : "Siguiente"} {!isLast && <ChevronRight size={22} />}
        </button>
      </div>
    </div>
  );
}

// ─── SpotlightTour ───────────────────────────────────────────────────────────

function SpotlightTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const accent = "#E98A15";
  const PAD = 10;
  const total = TOUR_STEPS.length;
  const cur = TOUR_STEPS[step];
  const isLast = step === total - 1;

  useLayoutEffect(() => {
    if (!cur.targetId) { setRect(null); return; }
    const measure = () => {
      const el = document.getElementById(cur.targetId!);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    measure();
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [step, cur.targetId]);

  const goNext = () => { if (isLast) onClose(); else setStep(s => s + 1); };
  const goPrev = () => { if (step > 0) setStep(s => s - 1); };

  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const overlayColor = "rgba(0,0,0,0.70)";

  const pr = rect ? {
    top:    Math.max(0, rect.top - PAD),
    left:   Math.max(0, rect.left - PAD),
    right:  Math.min(vw, rect.right + PAD),
    bottom: Math.min(vh, rect.bottom + PAD),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  } : null;

  const CARD_W = Math.min(vw - 32, 340);
  const cardCx = pr ? pr.left + pr.width / 2 : vw / 2;
  const cardLeft = Math.max(16, Math.min(vw - CARD_W - 16, cardCx - CARD_W / 2));

  let cardStyle: React.CSSProperties = { position: "absolute", width: `${CARD_W}px`, left: `${cardLeft}px` };
  if (cur.placement === "below" && pr) {
    cardStyle.top = `${Math.min(pr.bottom + 14, vh - 220)}px`;
  } else if (cur.placement === "above" && pr) {
    cardStyle.bottom = `${Math.max(vh - pr.top + 14, 16)}px`;
  } else {
    cardStyle = { position: "absolute", width: `${CARD_W}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)", maxHeight: "calc(100dvh - 40px)", overflowY: "auto" };
  }

  return (
    <div className="fixed inset-0 z-[60]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      {pr ? (
        <>
          <div style={{ position:"absolute",top:0,left:0,right:0,height:`${pr.top}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.bottom}px`,left:0,right:0,bottom:0,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:0,width:`${pr.left}px`,height:`${pr.height}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:`${pr.right}px`,right:0,height:`${pr.height}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:`${pr.left}px`,width:`${pr.width}px`,height:`${pr.height}px`,border:`2.5px solid ${accent}`,borderRadius:"12px",boxShadow:`0 0 0 2px ${accent}44,0 0 28px ${accent}99`,pointerEvents:"none" }}/>
        </>
      ) : (
        <div style={{ position:"absolute",inset:0,background:overlayColor }}/>
      )}

      <div style={{ ...cardStyle, background:"#FAF7F2", borderRadius:"20px", padding:"16px", boxShadow:"0 10px 48px rgba(0,0,0,0.40)", animation:`${cur.placement==="center"?"fadein-fade":"fadein"} 0.22s ease both`, display:"flex", flexDirection:"column", gap:"12px" }} key={step}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"26px", lineHeight:1 }}>{cur.emoji}</span>
            <span style={{ fontWeight:700, color:"#1a1206", fontSize:"17px", lineHeight:1.2 }}>{cur.title}</span>
          </div>
          <button onClick={onClose} style={{ flexShrink:0, width:"32px", height:"32px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#5c4f3d", background:"rgba(0,0,0,0.07)", border:"none", cursor:"pointer" }}>
            <X size={14}/>
          </button>
        </div>

        <p style={{ color:"#5c4f3d", fontSize:"15px", lineHeight:1.55, margin:0 }}>{cur.desc}</p>

        <div style={{ display:"flex", justifyContent:"center", gap:"6px" }}>
          {TOUR_STEPS.map((_,i) => (
            <div key={i} style={{ height:"7px", borderRadius:"4px", background:i===step?accent:"#d4c4a8", width:i===step?"22px":"7px", transition:"all 0.3s" }}/>
          ))}
        </div>

        <div style={{ display:"flex", gap:"8px" }}>
          {step > 0 && (
            <button onClick={goPrev} style={{ flex:1, minHeight:"46px", borderRadius:"12px", fontWeight:600, fontSize:"15px", background:"#f5f0e8", border:"1.5px solid #d4c4a8", color:"#5c4f3d", display:"flex", alignItems:"center", justifyContent:"center", gap:"4px", cursor:"pointer" }}>
              <ChevronLeft size={17}/> Atrás
            </button>
          )}
          <button onClick={goNext} style={{ flex:2, minHeight:"46px", borderRadius:"12px", fontWeight:700, fontSize:"15px", background:accent, color:"#fff", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:"4px", cursor:"pointer", boxShadow:`0 3px 14px ${accent}55` }}>
            {isLast ? "¡Entendido! 🎉" : <><span>Siguiente</span><ChevronRight size={17}/></>}
          </button>
        </div>

        {!isLast && (
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#9a8a7a", fontSize:"13px", cursor:"pointer", padding:"2px 0" }}>
            Saltar tutorial
          </button>
        )}
      </div>
    </div>
  );
}

// ─── LearningTour ────────────────────────────────────────────────────────────

function LearningTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const accent = "#E98A15";
  const PAD = 10;
  const total = LEARN_TOUR_STEPS.length;
  const cur = LEARN_TOUR_STEPS[step];
  const isLast = step === total - 1;

  useLayoutEffect(() => {
    if (!cur.targetId) { setRect(null); return; }
    const measure = () => {
      const el = document.getElementById(cur.targetId!);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    measure();
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [step, cur.targetId]);

  const goNext = () => { if (isLast) onClose(); else setStep(s => s + 1); };
  const goPrev = () => { if (step > 0) setStep(s => s - 1); };

  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const overlayColor = "rgba(0,0,0,0.72)";

  const pr = rect ? {
    top:    Math.max(0, rect.top - PAD),
    left:   Math.max(0, rect.left - PAD),
    right:  Math.min(vw, rect.right + PAD),
    bottom: Math.min(vh, rect.bottom + PAD),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  } : null;

  const CARD_W = Math.min(vw - 32, 340);
  const cardCx = pr ? pr.left + pr.width / 2 : vw / 2;
  const cardLeft = Math.max(16, Math.min(vw - CARD_W - 16, cardCx - CARD_W / 2));

  let cardStyle: React.CSSProperties = { position: "absolute", width: `${CARD_W}px`, left: `${cardLeft}px` };
  if (cur.placement === "below" && pr) {
    cardStyle.top = `${Math.min(pr.bottom + 14, vh - 240)}px`;
  } else if (cur.placement === "above" && pr) {
    cardStyle.bottom = `${Math.max(vh - pr.top + 14, 16)}px`;
  } else {
    cardStyle = { position: "absolute", width: `${CARD_W}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)", maxHeight: "calc(100dvh - 40px)", overflowY: "auto" };
  }

  return (
    <div className="fixed inset-0 z-[70]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      {pr ? (
        <>
          <div style={{ position:"absolute",top:0,left:0,right:0,height:`${pr.top}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.bottom}px`,left:0,right:0,bottom:0,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:0,width:`${pr.left}px`,height:`${pr.height}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:`${pr.right}px`,right:0,height:`${pr.height}px`,background:overlayColor }}/>
          <div style={{ position:"absolute",top:`${pr.top}px`,left:`${pr.left}px`,width:`${pr.width}px`,height:`${pr.height}px`,border:`2.5px solid ${accent}`,borderRadius:"12px",boxShadow:`0 0 0 2px ${accent}44,0 0 28px ${accent}99`,pointerEvents:"none" }}/>
        </>
      ) : (
        <div style={{ position:"absolute",inset:0,background:overlayColor }}/>
      )}

      <div style={{ ...cardStyle, background:"#FAF7F2", borderRadius:"20px", padding:"16px", boxShadow:"0 10px 48px rgba(0,0,0,0.40)", animation:`${cur.placement==="center"?"fadein-fade":"fadein"} 0.22s ease both`, display:"flex", flexDirection:"column", gap:"12px" }} key={step}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"26px", lineHeight:1 }}>{cur.emoji}</span>
            <span style={{ fontWeight:700, color:"#1a1206", fontSize:"17px", lineHeight:1.2 }}>{cur.title}</span>
          </div>
          <button onClick={onClose} style={{ flexShrink:0, width:"32px", height:"32px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#5c4f3d", background:"rgba(0,0,0,0.07)", border:"none", cursor:"pointer" }}>
            <X size={14}/>
          </button>
        </div>

        <p style={{ color:"#5c4f3d", fontSize:"15px", lineHeight:1.55, margin:0 }}>{cur.desc}</p>

        <div style={{ display:"flex", justifyContent:"center", gap:"6px" }}>
          {LEARN_TOUR_STEPS.map((_,i) => (
            <div key={i} style={{ height:"7px", borderRadius:"4px", background:i===step?accent:"#d4c4a8", width:i===step?"22px":"7px", transition:"all 0.3s" }}/>
          ))}
        </div>

        <div style={{ display:"flex", gap:"8px" }}>
          {step > 0 && (
            <button onClick={goPrev} style={{ flex:1, minHeight:"46px", borderRadius:"12px", fontWeight:600, fontSize:"15px", background:"#f5f0e8", border:"1.5px solid #d4c4a8", color:"#5c4f3d", display:"flex", alignItems:"center", justifyContent:"center", gap:"4px", cursor:"pointer" }}>
              <ChevronLeft size={17}/> Atrás
            </button>
          )}
          <button onClick={goNext} style={{ flex:2, minHeight:"46px", borderRadius:"12px", fontWeight:700, fontSize:"15px", background:accent, color:"#fff", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:"4px", cursor:"pointer", boxShadow:`0 3px 14px ${accent}55` }}>
            {isLast ? "¡Entendido! 🎉" : <><span>Siguiente</span><ChevronRight size={17}/></>}
          </button>
        </div>

        {!isLast && (
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#9a8a7a", fontSize:"13px", cursor:"pointer", padding:"2px 0" }}>
            Saltar tutorial
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Sudoku 9×9 ─────────────────────────────────────────────────────────────

function SudokuGame({ onWin }: { onWin: () => void }) {
  const [board, setBoard] = useState<number[][]>(SUDOKU_PUZZLE.map(r => [...r]));
  const [selected, setSelected] = useState<[number,number]|null>(null);
  const [checked, setChecked] = useState(false);
  const [won, setWon] = useState(false);
  const accent = "#E98A15";
  const isPre = (r: number, c: number) => SUDOKU_PUZZLE[r][c] !== 0;

  const tap = (r: number, c: number) => { if (!isPre(r,c)) { setSelected([r,c]); setChecked(false); } };
  const num = (n: number) => {
    if (!selected) return;
    const [r,c] = selected;
    setBoard(prev => { const b = prev.map(x=>[...x]); b[r][c]=n; return b; });
    setChecked(false);
  };
  const check = () => {
    setChecked(true);
    if (board.every((row,r) => row.every((v,c) => v===SUDOKU_SOLUTION[r][c]))) { setWon(true); onWin(); }
  };
  const reset = () => { setBoard(SUDOKU_PUZZLE.map(r=>[...r])); setSelected(null); setChecked(false); setWon(false); };

  const cellSize = 36;
  const boxBorder = "2.5px solid #a08060";
  const normalBorder = "1px solid #d4c4a8";

  return (
    <div className="flex flex-col items-center gap-4">
      {won && (
        <div className="unlock-pop w-full rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: "rgba(94,158,107,0.12)", border: "2px solid #5E9E6B" }}>
          <Trophy size={28} color="#5E9E6B" />
          <p className="font-bold" style={{ color: "#3d7a4a", fontSize: "18px" }}>¡Felicidades! Resolviste el Sudoku 🎉</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(9,${cellSize}px)`, gap: "1px", background: "#a08060", padding: "2px", borderRadius: "10px" }}>
        {board.map((row, r) => row.map((val, c) => {
          const pre = isPre(r,c);
          const sel = selected?.[0]===r && selected?.[1]===c;
          const wrong = checked && !won && !pre && val!==0 && val!==SUDOKU_SOLUTION[r][c];
          const right = checked && !pre && val!==0 && val===SUDOKU_SOLUTION[r][c];
          const sameBox = selected && Math.floor(selected[0]/3)===Math.floor(r/3) && Math.floor(selected[1]/3)===Math.floor(c/3);
          const sameRow = selected && selected[0]===r;
          const sameCol = selected && selected[1]===c;
          const highlight = !sel && (sameBox||sameRow||sameCol);
          return (
            <button key={`${r}-${c}`} onClick={() => tap(r,c)} style={{
              width: cellSize, height: cellSize,
              background: pre ? "#f0e8d8" : sel ? "#fff3dc" : wrong ? "#fde8e8" : right ? "#edf7f0" : highlight ? "#fdf6ec" : "#fff",
              fontSize: "16px", fontWeight: pre ? 700 : 600,
              color: pre ? "#5c3d10" : wrong ? "#b84340" : right ? "#3d7a4a" : sel ? "#1a1206" : "#1a1206",
              cursor: pre ? "default" : "pointer",
              borderRight: (c+1)%3===0 && c<8 ? boxBorder : normalBorder,
              borderBottom: (r+1)%3===0 && r<8 ? boxBorder : normalBorder,
              borderLeft: "none", borderTop: "none",
              outline: sel ? `2.5px solid ${accent}` : "none",
              outlineOffset: "-2px",
              position: "relative",
            }}>{val !== 0 ? val : ""}</button>
          );
        }))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} className="num-btn rounded-xl font-bold flex items-center justify-center"
            style={{ width:44, height:44, fontSize:"20px", background:"#fff", border:"2px solid #d4c4a8", boxShadow:"0 2px 6px rgba(0,0,0,0.1)", color:"#1a1206" }}
            onClick={() => num(n)}
          >{n}</button>
        ))}
        <button className="num-btn rounded-xl font-bold flex items-center justify-center"
          style={{ width:44, height:44, fontSize:"17px", background:"#fff", border:"2px solid #d4c4a8", color:"#D9534F" }}
          onClick={() => num(0)}
        >⌫</button>
      </div>

      <div className="flex gap-3 w-full">
        <button onClick={reset} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold"
          style={{ background:"#f5f0e8", border:"1.5px solid #d4c4a8", color:"#5c4f3d", fontSize:"16px", minHeight:"56px" }}
        ><RotateCcw size={18}/> Reiniciar</button>
        {!won && <button onClick={check} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold"
          style={{ background:accent, color:"#fff", fontSize:"16px", minHeight:"56px", boxShadow:`0 4px 18px ${accent}55` }}
        ><CheckCircle size={18}/> Verificar</button>}
      </div>
      {checked && !won && <p className="font-medium" style={{ color:"#D9534F", fontSize:"15px" }}>Hay respuestas incorrectas. ¡Sigue intentando!</p>}
    </div>
  );
}

// ─── Word Search ─────────────────────────────────────────────────────────────

function WordSearchGame({ onWin }: { onWin: () => void }) {
  const [startCell, setStartCell] = useState<[number,number]|null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [won, setWon] = useState(false);
  const cellSize = 38;

  const getCellColor = (r: number, c: number) => {
    for (const w of WS_WORDS) if (foundWords.includes(w.word) && w.cells.some(([wr,wc])=>wr===r&&wc===c)) return w.color;
    return null;
  };

  const tap = (r: number, c: number) => {
    if (!startCell) { setStartCell([r,c]); return; }
    if (startCell[0]===r && startCell[1]===c) { setStartCell(null); return; }
    const [r1,c1]=startCell;
    const dr=r-r1, dc=c-c1;
    const len=Math.max(Math.abs(dr),Math.abs(dc));
    if (!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc))) { setStartCell(null); return; }
    const sR=dr===0?0:dr>0?1:-1, sC=dc===0?0:dc>0?1:-1;
    let word=""; const cells:[number,number][]=[];
    for (let i=0;i<=len;i++) { const nr=r1+i*sR,nc=c1+i*sC; if(nr<0||nr>=8||nc<0||nc>=8){setStartCell(null);return;} cells.push([nr,nc]); word+=WS_GRID[nr][nc]; }
    const rev=word.split("").reverse().join("");
    const match=WS_WORDS.find(w=>(w.word===word||w.word===rev)&&!foundWords.includes(w.word));
    if (match) { const next=[...foundWords,match.word]; setFoundWords(next); if(next.length===WS_WORDS.length){setWon(true);onWin();} }
    setStartCell(null);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {won && (
        <div className="unlock-pop w-full rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background:"rgba(94,158,107,0.12)",border:"2px solid #5E9E6B" }}>
          <Trophy size={28} color="#5E9E6B"/><p className="font-bold" style={{ color:"#3d7a4a",fontSize:"18px" }}>¡Encontraste todas las palabras! 🎉</p>
        </div>
      )}
      <div className="w-full rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background:"#fff3dc",border:"1.5px solid #e6c87a" }}>
        <span style={{ fontSize:"22px",flexShrink:0 }}>👆</span>
        <p className="font-semibold leading-snug" style={{ color:"#5c3d10",fontSize:"17px" }}>
          Toca la <strong>primera letra</strong> de una palabra y luego la <strong>última letra</strong> para encontrarla. ¡Puedes buscar en cualquier dirección!
        </p>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:`repeat(8,${cellSize}px)`,gap:"3px" }}>
        {WS_GRID.map((row,r)=>row.map((letter,c)=>{
          const foundColor=getCellColor(r,c);
          const isSel=startCell?.[0]===r&&startCell?.[1]===c;
          return (
            <button key={`${r}-${c}`} onClick={()=>tap(r,c)} style={{
              width:cellSize,height:cellSize,
              background:foundColor??(isSel?"#fff3dc":"#fff"),
              borderStyle:"solid",borderColor:foundColor??(isSel?"#E98A15":"#d4c4a8"),
              borderWidth:isSel?"2.5px":foundColor?"2px":"1.5px",
              borderRadius:"7px",fontSize:"15px",fontWeight:700,
              color:foundColor?"#fff":"#1a1206",
              transition:"background 0.2s,border 0.2s",
            }}>{letter}</button>
          );
        }))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {WS_WORDS.map(w=>(
          <div key={w.word} className="px-4 py-2 rounded-full font-bold flex items-center gap-1.5"
            style={{ background:foundWords.includes(w.word)?w.color:"#f5f0e8",color:foundWords.includes(w.word)?"#fff":"#5c4f3d",fontSize:"15px",border:`1.5px solid ${foundWords.includes(w.word)?w.color:"#d4c4a8"}`,textDecoration:foundWords.includes(w.word)?"line-through":"none" }}
          >{foundWords.includes(w.word)?"✓":"○"} {w.word}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Crossword ──────────────────────────────────────────────────────────────

function CrosswordGame({ onWin }: { onWin: () => void }) {
  const ROWS=6, COLS=7;
  const empty = () => Array.from({length:ROWS},()=>Array(COLS).fill(""));
  const [userGrid, setUserGrid] = useState<string[][]>(empty());
  const [activeCell, setActiveCell] = useState<[number,number]|null>(null);
  const [activeDir, setActiveDir] = useState<"across"|"down">("across");
  const [checked, setChecked] = useState(false);
  const [won, setWon] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const inputRefs = useRef<Record<string,HTMLInputElement|null>>({});
  const accent = "#E98A15";

  const focusCell = (r:number,c:number) => setTimeout(()=>inputRefs.current[`${r},${c}`]?.focus(),0);
  const wordAt = (r:number,c:number,dir:"across"|"down") =>
    CW_WORDS.find(w => w.dir===dir && (dir==="across" ? w.row===r&&c>=w.col&&c<w.col+w.length : w.col===c&&r>=w.row&&r<w.row+w.length));
  const inActiveWord = (r:number,c:number) => {
    if (!activeCell) return false;
    const w=wordAt(activeCell[0],activeCell[1],activeDir);
    if (!w) return false;
    return activeDir==="across" ? w.row===r&&c>=w.col&&c<w.col+w.length : w.col===c&&r>=w.row&&r<w.row+w.length;
  };
  const setCell = (r:number,c:number,v:string) => { setUserGrid(prev=>{const n=prev.map(x=>[...x]);n[r][c]=v;return n;}); setChecked(false); };
  const moveNext = (r:number,c:number) => {
    const w=wordAt(r,c,activeDir); if(!w) return;
    if (activeDir==="across"&&c<w.col+w.length-1){const nc=c+1;setActiveCell([r,nc]);focusCell(r,nc);}
    else if (activeDir==="down"&&r<w.row+w.length-1){const nr=r+1;setActiveCell([nr,c]);focusCell(nr,c);}
  };
  const movePrev = (r:number,c:number) => {
    const w=wordAt(r,c,activeDir); if(!w) return;
    if (activeDir==="across"&&c>w.col){const pc=c-1;setActiveCell([r,pc]);setCell(r,pc,revealed.has(`${r},${pc}`)?(CW_SOLUTION[r][pc]??""):"");focusCell(r,pc);}
    else if (activeDir==="down"&&r>w.row){const pr=r-1;setActiveCell([pr,c]);setCell(pr,c,revealed.has(`${pr},${c}`)?(CW_SOLUTION[pr][c]??""):"");focusCell(pr,c);}
  };
  const handleCellClick = (r:number,c:number) => {
    if (activeCell?.[0]===r&&activeCell?.[1]===c) {
      const hasA=!!wordAt(r,c,"across"), hasD=!!wordAt(r,c,"down");
      if (hasA&&hasD) setActiveDir(d=>d==="across"?"down":"across");
    } else {
      setActiveCell([r,c]);
      if (!wordAt(r,c,activeDir)) { const other=activeDir==="across"?"down":"across"; if (wordAt(r,c,other)) setActiveDir(other); }
    }
    focusCell(r,c);
  };
  const handleChange = (r:number,c:number,val:string) => {
    if (revealed.has(`${r},${c}`)) return;
    const letters=val.toUpperCase().replace(/[^A-Z]/g,"");
    if (letters==="") { setCell(r,c,""); return; }
    setCell(r,c,letters[letters.length-1]);
    moveNext(r,c);
  };
  const handleKeyDown = (r:number,c:number,e:React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key==="Backspace" && (userGrid[r][c]===""||revealed.has(`${r},${c}`))) { e.preventDefault(); movePrev(r,c); }
  };
  const handleHint = () => {
    if (!activeCell||hintsLeft===0) return;
    const [r,c]=activeCell; const sol=CW_SOLUTION[r][c]; if(!sol) return;
    const key=`${r},${c}`; setRevealed(prev=>new Set([...prev,key])); setHintsLeft(h=>h-1); setCell(r,c,sol); moveNext(r,c);
  };
  const handleClearWord = () => {
    if (!activeCell) return;
    const [r,c]=activeCell; const w=wordAt(r,c,activeDir); if(!w) return;
    setUserGrid(prev=>{ const n=prev.map(x=>[...x]); for(let i=0;i<w.length;i++){const wr=activeDir==="across"?w.row:w.row+i,wc=activeDir==="across"?w.col+i:w.col; if(!revealed.has(`${wr},${wc}`)) n[wr][wc]="";} return n; });
    setChecked(false); focusCell(r,c);
  };
  const handleCheck = () => {
    setChecked(true);
    if (CW_SOLUTION.every((row,r)=>row.every((sol,c)=>sol===null||userGrid[r][c]===sol))) { setWon(true); onWin(); }
  };
  const handleReset = () => { setUserGrid(empty()); setActiveCell(null); setChecked(false); setWon(false); setRevealed(new Set()); setHintsLeft(3); };
  const cellSize=48;

  return (
    <div className="flex flex-col gap-4">
      {won && (
        <div className="unlock-pop rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background:"rgba(94,158,107,0.12)",border:"2px solid #5E9E6B" }}>
          <Trophy size={28} color="#5E9E6B"/><p className="font-bold" style={{ color:"#3d7a4a",fontSize:"18px" }}>¡Crucigrama resuelto! 🎉</p>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleHint} disabled={hintsLeft===0||!activeCell}
          className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all active:scale-95"
          style={{ background:hintsLeft>0&&activeCell?"#fff3dc":"#f0ebe2",border:`1.5px solid ${hintsLeft>0&&activeCell?"#e6c87a":"#d4c4a8"}`,color:hintsLeft>0&&activeCell?"#7a4a00":"#9a8a7a",fontSize:"15px",minHeight:"48px",cursor:hintsLeft>0&&activeCell?"pointer":"not-allowed" }}
        >💡 Pista ({hintsLeft})</button>
        <button onClick={handleClearWord} disabled={!activeCell}
          className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all active:scale-95"
          style={{ background:activeCell?"#fde8e8":"#f0ebe2",border:`1.5px solid ${activeCell?"#f5a0a0":"#d4c4a8"}`,color:activeCell?"#b84340":"#9a8a7a",fontSize:"15px",minHeight:"48px",cursor:activeCell?"pointer":"not-allowed" }}
        >🗑️ Borrar palabra</button>
      </div>
      <p style={{ color:"#5c4f3d",fontSize:"14px" }}>Toca una celda para seleccionarla. Toca dos veces para cambiar dirección.</p>
      <div style={{ display:"grid",gridTemplateColumns:`repeat(${COLS},${cellSize}px)`,gap:"3px",alignSelf:"center" }}>
        {CW_SOLUTION.map((row,r)=>row.map((sol,c)=>{
          if (sol===null) return <div key={`${r}-${c}`} style={{ width:cellSize,height:cellSize,background:"#2a1f10",borderRadius:"5px" }}/>;
          const numKey=`${r},${c}`; const num=CW_NUMBERS[numKey]; const v=userGrid[r]?.[c]??"";
          const isActive=activeCell?.[0]===r&&activeCell?.[1]===c; const inWord=inActiveWord(r,c);
          const isRevealed=revealed.has(numKey);
          const wrong=checked&&!won&&v!==""&&v!==sol&&!isRevealed;
          const correct=(checked&&v===sol)||isRevealed;
          return (
            <div key={`${r}-${c}`} className="relative" style={{ width:cellSize,height:cellSize }} onClick={()=>handleCellClick(r,c)}>
              {num&&<span className="absolute font-bold z-10" style={{ fontSize:"10px",top:"2px",left:"4px",color:"#5c4f3d",lineHeight:1,pointerEvents:"none" }}>{num}</span>}
              <input ref={el=>{inputRefs.current[numKey]=el;}} type="text" maxLength={2}
                autoCorrect="off" autoCapitalize="characters" spellCheck={false}
                value={v} onChange={e=>handleChange(r,c,e.target.value)} onKeyDown={e=>handleKeyDown(r,c,e)} onFocus={()=>handleCellClick(r,c)} readOnly={isRevealed}
                className="cw-cell w-full h-full text-center font-bold uppercase"
                style={{ fontSize:"22px",background:isActive?"#fff3dc":inWord?"#fffae8":wrong?"#fde8e8":correct?"#edf7f0":isRevealed?"#e8f4eb":"#fff",borderStyle:"solid",borderColor:isActive?accent:inWord?`${accent}88`:wrong?"#D9534F":correct?"#5E9E6B":"#d4c4a8",borderWidth:isActive?"2.5px":inWord?"1.5px":wrong||correct?"2px":"1.5px",borderRadius:"6px",color:wrong?"#b84340":correct?"#3d7a4a":"#1a1206",paddingTop:num?"14px":"0",cursor:"pointer" }}
              />
            </div>
          );
        }))}
      </div>
      <div className="rounded-2xl p-4" style={{ background:"#fff",border:"1.5px solid #d4c4a8" }}>
        <p className="font-bold mb-2" style={{ color:"#5c3d10",fontSize:"16px" }}>Horizontales</p>
        {CW_CLUES.across.map(cl=>(
          <p key={cl.num} className="mb-1 leading-snug" style={{ color:"#1a1206",fontSize:"15px" }}>
            <span className="font-bold" style={{ color:accent }}>{cl.num}.</span> {cl.clue}
          </p>
        ))}
        <p className="font-bold mt-3 mb-2" style={{ color:"#5c3d10",fontSize:"16px" }}>Verticales</p>
        {CW_CLUES.down.map(cl=>(
          <p key={cl.num} className="mb-1 leading-snug" style={{ color:"#1a1206",fontSize:"15px" }}>
            <span className="font-bold" style={{ color:accent }}>{cl.num}.</span> {cl.clue}
          </p>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={handleReset} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold"
          style={{ background:"#f5f0e8",border:"1.5px solid #d4c4a8",color:"#5c4f3d",fontSize:"16px",minHeight:"56px" }}
        ><RotateCcw size={18}/> Reiniciar</button>
        {!won&&<button onClick={handleCheck} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold"
          style={{ background:accent,color:"#fff",fontSize:"16px",minHeight:"56px",boxShadow:`0 4px 18px ${accent}55` }}
        ><CheckCircle size={18}/> Verificar</button>}
      </div>
      {checked&&!won&&<p className="font-medium text-center" style={{ color:"#D9534F",fontSize:"15px" }}>Hay letras incorrectas. ¡Sigue intentando!</p>}
    </div>
  );
}

// ─── Learning Screen ─────────────────────────────────────────────────────────

function LearningScreen({ dark, onClose }: { dark: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"exercises"|"games">("exercises");
  const [showLearningTour, setShowLearningTour] = useState(false);
  const learningTourShown = useRef(false);
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [answered, setAnswered] = useState<boolean|null>(null);
  const [correct, setCorrect] = useState(false);
  const [unlockedGames, setUnlockedGames] = useState(0);
  const [answeredCorrectly, setAnsweredCorrectly] = useState<Set<number>>(new Set());
  const [activeGame, setActiveGame] = useState<GameId|null>(null);
  const [wonGames, setWonGames] = useState<Set<GameId>>(new Set());
  const [justUnlocked, setJustUnlocked] = useState<GameId|null>(null);
  const accent = "#E98A15";
  const bg = "#FAF7F2"; const cardBg = "#ffffff"; const fg = "#1a1206"; const sub = "#5c4f3d"; const border = "rgba(0,0,0,0.10)";
  const ex = EXERCISES[exerciseIdx];
  const isLast = exerciseIdx === EXERCISES.length - 1;

  const handleAnswer = (yes: boolean) => {
    const isCorrect = yes === ex.correctIsYes;
    setAnswered(yes); setCorrect(isCorrect);
    if (isCorrect && !answeredCorrectly.has(exerciseIdx)) {
      const ns = new Set([...answeredCorrectly, exerciseIdx]);
      setAnsweredCorrectly(ns);
      const nc = unlockedGames + 1; setUnlockedGames(nc);
      const gid = GAME_ORDER[nc-1]; if (gid) setJustUnlocked(gid);
    }
  };
  const handleNext = () => { if (!isLast) { setExerciseIdx(i=>i+1); setAnswered(null); setCorrect(false); setJustUnlocked(null); } else { onClose(); } };
  const handleRetry = () => { setAnswered(null); setJustUnlocked(null); };
  const handleGoGame = () => { setTab("games"); setJustUnlocked(null); };

  useEffect(() => {
    if (!learningTourShown.current) {
      learningTourShown.current = true;
      setTimeout(() => setShowLearningTour(true), 350);
    }
  }, []);

  if (activeGame) {
    const meta = GAME_META[activeGame];
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: bg, fontFamily:"'Plus Jakarta Sans',sans-serif", animation:"overlay-in 0.3s ease both" }}>
        <style>{globalCSS}</style>
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4" style={{ borderBottom:`1px solid ${border}`,background:"rgba(250,247,242,0.97)" }}>
          <button onClick={()=>setActiveGame(null)} className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background:"rgba(0,0,0,0.06)",color:sub }}><X size={22}/></button>
          <span style={{ fontSize:"24px" }}>{meta.emoji}</span>
          <div><p className="font-bold" style={{ color:fg,fontSize:"18px" }}>{meta.title}</p><p style={{ color:sub,fontSize:"14px" }}>{meta.desc}</p></div>
        </div>
        <div className="flex-1 overflow-y-auto chat-scroll px-5 py-6 max-w-lg mx-auto w-full">
          {activeGame==="sudoku"&&<SudokuGame onWin={()=>setWonGames(prev=>new Set([...prev,"sudoku"]))}/>}
          {activeGame==="wordsearch"&&<WordSearchGame onWin={()=>setWonGames(prev=>new Set([...prev,"wordsearch"]))}/>}
          {activeGame==="crossword"&&<CrosswordGame onWin={()=>setWonGames(prev=>new Set([...prev,"crossword"]))}/>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:bg, fontFamily:"'Plus Jakarta Sans',sans-serif", animation:"overlay-in 0.3s ease both" }}>
      <style>{globalCSS}</style>
      {showLearningTour && <LearningTour onClose={()=>setShowLearningTour(false)}/>}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4" style={{ borderBottom:`1px solid ${border}`,background:"rgba(250,247,242,0.97)" }}>
        <div className="flex items-center gap-3"><BookOpen size={26} color={accent}/><p className="font-bold" style={{ color:fg,fontSize:"20px" }}>Zona de Aprendizaje</p></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowLearningTour(true)} className="w-12 h-12 rounded-full flex items-center justify-center font-bold" style={{ color:accent,background:`${accent}18`,fontSize:"20px" }} aria-label="Tutorial">❓</button>
          <button onClick={onClose} className="w-12 h-12 rounded-full flex items-center justify-center" style={{ color:sub,background:"rgba(0,0,0,0.06)" }}><X size={22}/></button>
        </div>
      </div>
      <div className="flex-shrink-0 flex" style={{ borderBottom:`1px solid ${border}`,background:"rgba(250,247,242,0.97)" }}>
        <button id="learn-tab-exercises" onClick={()=>setTab("exercises")} className="flex-1 flex items-center justify-center gap-2 py-4 font-bold transition-colors"
          style={{ color:tab==="exercises"?accent:sub,fontSize:"15px",borderBottom:tab==="exercises"?`3px solid ${accent}`:"3px solid transparent" }}>
          Ejercicios
        </button>
        <button id="learn-tab-games" onClick={()=>setTab("games")} className="flex-1 flex items-center justify-center gap-2 py-4 font-bold transition-colors"
          style={{ color:tab==="games"?accent:sub,fontSize:"15px",borderBottom:tab==="games"?`3px solid ${accent}`:"3px solid transparent" }}>
          Juegos
          {unlockedGames>0&&<span className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-white" style={{ background:accent,fontSize:"12px" }}>{unlockedGames}</span>}
          {unlockedGames===0&&<Lock size={14} color={sub}/>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto chat-scroll px-5 py-5 max-w-lg mx-auto w-full">
        {tab==="exercises"&&(
          <div className="flex flex-col gap-5">
            <p style={{ color:sub,fontSize:"14px" }}>Ejercicio {exerciseIdx+1} de {EXERCISES.length}</p>
            <div className="h-2 rounded-full" style={{ background:"rgba(0,0,0,0.07)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width:`${((exerciseIdx+(answered!==null?1:0))/EXERCISES.length)*100}%`,background:accent }}/>
            </div>
            <div id="learn-exercise-card" className="rounded-2xl overflow-hidden" style={{ background:cardBg,border:`1px solid ${border}`,boxShadow:"0 2px 16px rgba(0,0,0,0.08)" }}>
              {ex.image
                ? <img src={ex.image} alt={ex.imageAlt} className="w-full object-cover" style={{ maxHeight:"240px" }}/>
                : ex.whatsappText
                  ? <div className="px-4 py-5" style={{ background:"#e5ddd5" }}>
                      <div className="rounded-2xl px-5 py-4 max-w-xs" style={{ background:"#dcf8c6",boxShadow:"0 1px 4px rgba(0,0,0,0.15)" }}>
                        <p className="leading-relaxed font-medium" style={{ color:"#1a1206",fontSize:"15px" }}>{ex.whatsappText}</p>
                        <p className="text-right mt-2" style={{ color:"#606770",fontSize:"12px" }}>● ●</p>
                      </div>
                    </div>
                  : null}
              <div className="px-5 py-4">
                <p className="font-bold leading-snug mb-1" style={{ color:fg,fontSize:"17px" }}>{ex.question}</p>
                <p style={{ color:sub,fontSize:"15px" }}>{ex.hint}</p>
              </div>
            </div>
            {answered===null&&(
              <>
                <div id="learn-answer-btns" className="flex gap-3">
                  {[{label:"✓  Sí",value:true},{label:"✗  No",value:false}].map(({label,value})=>(
                    <button key={String(value)} onClick={()=>handleAnswer(value)}
                      className="flex-1 py-5 rounded-2xl font-bold transition-all active:scale-95"
                      style={{ background:value?"linear-gradient(135deg,#5E9E6B,#4a8a57)":"linear-gradient(135deg,#D9534F,#b84340)",color:"#fff",fontSize:"18px",boxShadow:value?"0 4px 18px rgba(34,197,94,0.3)":"0 4px 18px rgba(224,82,82,0.3)",minHeight:"64px" }}
                    >{label}</button>
                  ))}
                </div>
                <div className="flex items-start gap-3 px-1">
                  <LogoImg dark={dark} className="w-11 h-11 flex-shrink-0 mt-0.5"/>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 leading-relaxed flex-1" style={{ background:cardBg,border:`1px solid ${border}`,color:sub,fontSize:"15px" }}>
                    Observa bien antes de responder. Recuerda: no todo lo que parece real lo es, y no toda fuente que comparte información verdadera es confiable.
                  </div>
                </div>
              </>
            )}
            {answered!==null&&(
              <div className="rounded-2xl px-5 py-5 flex flex-col gap-4 msg-enter"
                style={{ background:correct?"rgba(34,197,94,0.08)":"rgba(224,82,82,0.08)",border:`2px solid ${correct?"#5E9E6B":"#D9534F"}` }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ fontSize:"36px" }}>{correct?"🎉":"💡"}</span>
                  <p className="font-bold" style={{ color:correct?"#3d7a4a":"#b84340",fontSize:"18px" }}>{correct?"¡Respuesta correcta!":"¡Respuesta incorrecta!"}</p>
                </div>
                <p className="leading-relaxed" style={{ color:fg,fontSize:"16px" }}>{correct?ex.feedbackCorrect:ex.feedbackWrong}</p>
                {correct&&justUnlocked&&(
                  <div className="unlock-pop rounded-xl px-4 py-3 flex items-center gap-3" style={{ background:`${accent}18`,border:`2px solid ${accent}` }}>
                    <span style={{ fontSize:"28px" }}>{GAME_META[justUnlocked].emoji}</span>
                    <div><p className="font-bold" style={{ color:accent,fontSize:"16px" }}>¡Juego desbloqueado!</p><p style={{ color:sub,fontSize:"14px" }}>{GAME_META[justUnlocked].title} disponible</p></div>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  {!correct&&(
                    <button onClick={handleRetry} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all active:scale-95"
                      style={{ background:"#fff3dc",border:`2px solid ${accent}`,color:"#7a4a00",fontSize:"17px",minHeight:"58px" }}
                    ><RotateCcw size={20}/> Reintentar ejercicio</button>
                  )}
                  {correct&&justUnlocked&&(
                    <button onClick={handleGoGame} className="w-full py-4 rounded-xl font-bold transition-all active:scale-95"
                      style={{ background:accent,color:"#fff",fontSize:"17px",boxShadow:`0 4px 18px ${accent}44`,minHeight:"58px" }}
                    >🎮 Ver mi nuevo juego →</button>
                  )}
                  <button onClick={handleNext} className="w-full py-4 rounded-xl font-bold transition-all active:scale-95"
                    style={{ background:correct&&justUnlocked?"#f5f0e8":correct?"#E98A15":"#f5f0e8",color:correct&&justUnlocked?sub:correct?"#fff":sub,border:(!correct||justUnlocked)?"1.5px solid #d4c4a8":"none",fontSize:"17px",minHeight:"58px",boxShadow:correct&&!justUnlocked?`0 4px 18px ${accent}44`:"none" }}
                  >{isLast?"Finalizar ejercicios":"Siguiente ejercicio →"}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {tab==="games"&&(
          <div className="flex flex-col gap-4">
            <p style={{ color:sub,fontSize:"15px" }}>
              {GAME_ORDER.length-unlockedGames>0?`Responde ejercicios correctamente para desbloquear más juegos. (${GAME_ORDER.length-unlockedGames} por desbloquear)`:"¡Todos los juegos están desbloqueados!"}
            </p>
            {GAME_ORDER.map((gameId,i)=>{
              const meta=GAME_META[gameId]; const unlocked=unlockedGames>i; const gWon=wonGames.has(gameId);
              return (
                <div key={gameId} className={`rounded-2xl p-5 flex items-center gap-4 transition-all ${unlocked?"cursor-pointer active:scale-[0.98]":""}`}
                  style={{ background:unlocked?cardBg:"#f0ebe2",border:unlocked?`2px solid ${gWon?"#5E9E6B":accent}`:"1.5px solid #d4c4a8",boxShadow:unlocked?`0 3px 20px ${gWon?"rgba(94,158,107,0.2)":`${accent}22`}`:"none",opacity:unlocked?1:0.55 }}
                  onClick={()=>unlocked&&setActiveGame(gameId)}
                >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:unlocked?`${accent}18`:"rgba(0,0,0,0.06)",fontSize:"32px" }}>{meta.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1"><p className="font-bold" style={{ color:unlocked?fg:"#9a8a7a",fontSize:"18px" }}>{meta.title}</p>{gWon&&<span>🏆</span>}</div>
                    <p style={{ color:unlocked?sub:"#9a8a7a",fontSize:"14px" }}>{meta.desc}</p>
                  </div>
                  {unlocked?<ChevronRight size={24} color={sub}/>:<Lock size={22} color="#9a8a7a"/>}
                </div>
              );
            })}
            {unlockedGames<GAME_ORDER.length&&(
              <div className="rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background:"#fff3dc",border:`1.5px solid ${accent}` }}>
                <span style={{ fontSize:"24px" }}>💡</span>
                <p style={{ color:"#5c3d10",fontSize:"15px" }}>Ve a <strong>Ejercicios</strong> y responde correctamente para desbloquear más juegos.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({ settings, onChange }: { settings: AppSettings; onChange: (s: Partial<AppSettings>) => void }) {
  const accent="#E98A15"; const border="rgba(0,0,0,0.12)"; const label="#1a1206"; const sub="#5c4f3d";
  const voices=["Presentador","Jovial","Guayaco","Defecto"] as const;
  const sizes=["A","A+","A++"] as const;
  return (
    <div className="space-y-6 px-1 py-2">
      <section>
        <p className="font-bold uppercase tracking-widest mb-3" style={{ color:sub,fontFamily:"'DM Mono',monospace",fontSize:"13px" }}>Brillo</p>
        <div className="flex items-center gap-3">
          <Sun size={18} color={sub}/>
          <input type="range" min={20} max={100} value={settings.brightness} onChange={e=>onChange({brightness:Number(e.target.value)})}
            className="flex-1 h-2.5 rounded-full appearance-none cursor-pointer"
            style={{ background:`linear-gradient(to right, ${accent} ${settings.brightness}%, ${border} ${settings.brightness}%)`,accentColor:accent }}
          />
          <Sun size={24} color={sub}/>
        </div>
        <p className="text-right font-medium mt-1.5" style={{ color:sub,fontSize:"15px" }}>{settings.brightness}%</p>
      </section>
      <section>
        <p className="font-bold uppercase tracking-widest mb-3" style={{ color:sub,fontFamily:"'DM Mono',monospace",fontSize:"13px" }}>Voz del asistente</p>
        <div className="space-y-2">
          {voices.map(v=>{
            const active=settings.voice===v;
            return (
              <button key={v} onClick={()=>onChange({voice:v})} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left"
                style={{ background:active?`${accent}18`:"transparent",border:`1.5px solid ${active?accent:border}`,minHeight:"58px" }}
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2" style={{ borderColor:active?accent:sub }}>
                  {active&&<div className="w-3 h-3 rounded-full" style={{ background:accent }}/>}
                </div>
                <span style={{ color:active?label:sub,fontWeight:active?600:400,fontSize:"17px" }}>{v}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <p className="font-bold uppercase tracking-widest mb-3" style={{ color:sub,fontFamily:"'DM Mono',monospace",fontSize:"13px" }}>Tamaño de texto</p>
        <div className="flex gap-2">
          {sizes.map(s=>{
            const active=settings.fontSize===s;
            const textSz=s==="A"?"text-lg":s==="A+"?"text-xl":"text-2xl";
            return (
              <button key={s} onClick={()=>onChange({fontSize:s})} className={`flex-1 py-4 rounded-xl font-bold transition-all ${textSz}`}
                style={{ background:active?`${accent}22`:"#fff",border:`2px solid ${active?accent:border}`,color:active?accent:sub,minHeight:"64px" }}
              >{s}</button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── BigMicButton ────────────────────────────────────────────────────────────

function BigMicButton({ onTranscript, accent, dark, compact=false }: {
  onTranscript:(t?:string)=>void; accent:string; dark:boolean; compact?:boolean;
}) {
  const [listening,setListening]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const recRef=useRef<SpeechRecognitionLike|null>(null);
  const transcriptRef=useRef("");

  const toggle=()=>{
    if(listening){
      recRef.current?.stop();
      return;
    }
    const rec=getSpeechRecognition();
    if(!rec){
      setError("Tu navegador no soporta reconocimiento de voz. Prueba en Chrome.");
      return;
    }
    setError(null);
    transcriptRef.current="";
    rec.onresult=(e:any)=>{
      let text="";
      for(let i=0;i<e.results.length;i++) text+=e.results[i][0].transcript;
      transcriptRef.current=text;
    };
    rec.onerror=()=>{ setError("No se pudo escuchar. Intenta de nuevo."); setListening(false); };
    rec.onend=()=>{ setListening(false); onTranscript(transcriptRef.current.trim()||undefined); };
    recRef.current=rec;
    rec.start();
    setListening(true);
  };
  useEffect(()=>()=>{ recRef.current?.stop(); },[]);
  const sz=compact?"w-20 h-20":"w-32 h-32"; const ico=compact?30:52;
  return (
    <div className={`flex flex-col items-center ${compact?"gap-2":"gap-4"}`}>
      <div className="relative">
        {listening&&<><div className="absolute inset-0 rounded-full" style={{ animation:"pulse-ring 1.2s ease-out infinite",background:`${accent}30` }}/><div className="absolute inset-0 rounded-full" style={{ animation:"pulse-ring 1.2s ease-out 0.4s infinite",background:`${accent}20` }}/></>}
        <button onClick={toggle} className={`relative ${sz} rounded-full flex items-center justify-center transition-all duration-200 active:scale-95`}
          style={{ background:listening?`linear-gradient(135deg,${accent},${accent}cc)`:"linear-gradient(135deg,#fef3e2,#fde4b8)",border:`${compact?"2.5px":"3.5px"} solid ${listening?accent:"rgba(0,0,0,0.14)"}`,boxShadow:listening?`0 0 ${compact?32:52}px ${accent}55,0 4px 20px rgba(0,0,0,0.25)`:"0 4px 24px rgba(0,0,0,0.14)" }}
          aria-label={listening?"Detener grabación":"Hablar con MIJO"}
        >{listening?<MicOff size={ico} color="#fff"/>:<Mic size={ico} color={accent}/>}</button>
      </div>
      <WaveAnimation active={listening} color={accent}/>
      <p className="font-semibold" style={{ color: error?"#b84340":"#5c4f3d",fontSize:compact?"15px":"17px" }}>
        {error??(listening?"Escuchando… toca para detener":"Presiona el micrófono para hablar")}
      </p>
    </div>
  );
}

// ─── InputBar ────────────────────────────────────────────────────────────────

function InputBar({ onSend, dark, accent, onMicPress }: { onSend:(text:string,imageFile?:File)=>void; dark:boolean; accent:string; onMicPress?:(transcript?:string)=>void }) {
  const [input,setInput]=useState(""); const [imageFile,setImageFile]=useState<File|null>(null); const [imagePreview,setImagePreview]=useState<string|null>(null);
  const [listening,setListening]=useState(false);
  const recRef=useRef<SpeechRecognitionLike|null>(null); const transcriptRef=useRef("");
  const fileRef=useRef<HTMLInputElement>(null); const taRef=useRef<HTMLTextAreaElement>(null);
  const canSend=!!(input.trim()||imageFile); const iconColor="#5c4f3d";
  const send=()=>{if(!canSend)return;onSend(input.trim(),imageFile??undefined);setInput("");setImageFile(null);setImagePreview(null);if(taRef.current)taRef.current.style.height="auto";};
  const handleKey=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};
  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(f){setImageFile(f);setImagePreview(URL.createObjectURL(f));}e.target.value="";};
  const removeImage=()=>{if(imagePreview)URL.revokeObjectURL(imagePreview);setImageFile(null);setImagePreview(null);};
  const toggleMic=()=>{
    if(listening){ recRef.current?.stop(); return; }
    const rec=getSpeechRecognition();
    if(!rec) return;
    transcriptRef.current="";
    rec.onresult=(e:any)=>{let text="";for(let i=0;i<e.results.length;i++) text+=e.results[i][0].transcript;transcriptRef.current=text;};
    rec.onerror=()=>setListening(false);
    rec.onend=()=>{ setListening(false); onMicPress?.(transcriptRef.current.trim()||undefined); };
    recRef.current=rec; rec.start(); setListening(true);
  };
  useEffect(()=>()=>{ recRef.current?.stop(); },[]);
  const showMic=!!onMicPress&&!canSend;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:listening?"#fffbf4":"#ffffff",border:`1.5px solid ${listening?accent:"rgba(0,0,0,0.14)"}`,boxShadow:listening?`0 2px 18px ${accent}33`:"0 2px 18px rgba(0,0,0,0.10)",transition:"border-color 0.2s,box-shadow 0.2s" }}>
      {imagePreview&&(
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <div className="relative flex-shrink-0">
            <img src={imagePreview} alt="Vista previa" className="w-12 h-12 object-cover rounded-lg border border-border"/>
            <button onClick={removeImage} className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background:"#D9534F" }} aria-label="Eliminar imagen"><X size={11}/></button>
          </div>
          {imageFile&&<span className="truncate flex-1 min-w-0" style={{ color:iconColor,fontFamily:"'DM Mono',monospace",fontSize:"14px" }}>{imageFile.name}</span>}
        </div>
      )}
      <div className="flex items-end gap-1 px-2 py-2">
        {!listening&&(
          <div className="flex items-center gap-0 mb-0.5">
            <button id="tour-img-btn" onClick={()=>fileRef.current?.click()} className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ color:imageFile?accent:iconColor }} aria-label="Adjuntar imagen"><Image size={20}/></button>
            <button id="tour-link-btn" onClick={()=>{const url=window.prompt("Pega un link para verificar:");if(url)onSend(url);}} className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ color:iconColor }} aria-label="Adjuntar enlace"><Link size={20}/></button>
          </div>
        )}
        {listening?(
          <div className="flex-1 flex items-center gap-3 px-2 py-3">
            <div className="flex gap-0.5 items-end">
              {[0.4,0.7,1,0.55,0.9,0.45,1,0.75,0.5,0.85,0.95,0.6].map((h,i)=>(
                <div key={i} style={{ width:"3px",borderRadius:"2px",background:accent,animation:`wave 0.55s ease-in-out ${i*0.07}s infinite alternate`,height:`${6+h*14}px` }}/>
              ))}
            </div>
            <span className="font-semibold" style={{ color:accent,fontSize:"15px" }}>Escuchando…</span>
          </div>
        ):(
          <textarea id="tour-text-area" ref={taRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={imageFile?"Añade un comentario (opcional)…":"Escribe aquí lo que quieres verificar…"}
            rows={1} className="flex-1 bg-transparent resize-none outline-none leading-relaxed py-2.5"
            style={{ maxHeight:"120px",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#1a1206",fontSize:"inherit" }}
            onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=Math.min(el.scrollHeight,120)+"px";}}
          />
        )}
        <div className="flex items-center mb-0.5">
          {canSend&&!listening?(
            <button onClick={send} className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95"
              style={{ background:accent,color:"#fff",cursor:"pointer",boxShadow:`0 2px 10px ${accent}55` }} aria-label="Enviar mensaje"><Send size={20}/></button>
          ):showMic?(
            <div id="tour-mic-btn" className="relative">
              {listening&&<><div className="absolute inset-0 rounded-full pointer-events-none" style={{ animation:"pulse-ring 1.1s ease-out infinite",background:`${accent}28` }}/><div className="absolute inset-0 rounded-full pointer-events-none" style={{ animation:"pulse-ring 1.1s ease-out 0.38s infinite",background:`${accent}18` }}/></>}
              <button onClick={toggleMic} className="relative w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background:listening?accent:"linear-gradient(135deg,#fef3e2,#fde4b8)",border:`2px solid ${listening?accent:"rgba(0,0,0,0.13)"}`,boxShadow:listening?`0 0 18px ${accent}77,0 3px 10px rgba(0,0,0,0.18)`:"0 2px 8px rgba(0,0,0,0.12)",cursor:"pointer" }}
                aria-label={listening?"Detener grabación":"Hablar con MIJO"}>
                {listening?<MicOff size={18} color="#fff"/>:<Mic size={18} color={accent}/>}
              </button>
            </div>
          ):(
            <button onClick={send} disabled className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background:"transparent",color:iconColor,cursor:"default" }} aria-label="Enviar"><Send size={20}/></button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile}/>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

type SidebarTab = "new"|"learn"|"settings"|"tutorial"|null;

function Sidebar({ open,onClose,settings,onSettingsChange,onLearnOpen,onNewChat,onTutorialOpen }: {
  open:boolean; onClose:()=>void; settings:AppSettings; onSettingsChange:(s:Partial<AppSettings>)=>void;
  onLearnOpen:()=>void; onNewChat:()=>void; onTutorialOpen:()=>void;
}) {
  const [activeTab,setActiveTab]=useState<SidebarTab>(null);
  const sidebarBg="#f5f0e8"; const sidebarBorder="rgba(0,0,0,0.09)"; const accent="#E98A15"; const mutedFg="#5c4f3d";
  const menuItems=[
    {id:"new" as SidebarTab,icon:Plus,label:"Nueva consulta"},
    {id:"learn" as SidebarTab,icon:BookOpen,label:"Aprendizaje"},
    {id:"tutorial" as SidebarTab,icon:HelpCircle,label:"Tutorial de MIJO"},
    {id:"settings" as SidebarTab,icon:Settings,label:"Configuración de pantalla"},
  ];
  return (
    <>
      {open&&<div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose}/>}
      <aside className="fixed top-0 left-0 h-full z-50 flex flex-col"
        style={{ width:"320px",background:sidebarBg,borderRight:`1px solid ${sidebarBorder}`,transform:open?"translateX(0)":"translateX(-100%)",transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",boxShadow:open?"4px 0 32px rgba(0,0,0,0.2)":"none" }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-5" style={{ borderBottom:`1px solid ${sidebarBorder}` }}>
          <LogoImg dark={false} className="h-11 w-auto"/>
          <button onClick={onClose} className="w-12 h-12 rounded-full flex items-center justify-center" style={{ color:mutedFg,background:"rgba(0,0,0,0.06)" }} aria-label="Cerrar menú"><X size={22}/></button>
        </div>
        <nav className="flex-shrink-0 px-3 py-3 space-y-1">
          {menuItems.map(({id,icon:Icon,label})=>(
            <button key={id} onClick={()=>setActiveTab(activeTab===id?null:id)} className="w-full flex items-center justify-between px-4 py-4 rounded-xl transition-all"
              style={{ background:activeTab===id?`${accent}18`:"transparent",color:activeTab===id?accent:mutedFg,minHeight:"60px" }}
            >
              <div className="flex items-center gap-3"><Icon size={22}/><span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:"17px" }}>{label}</span></div>
              <ChevronRight size={18} style={{ transform:activeTab===id?"rotate(90deg)":"rotate(0)",transition:"transform 0.2s",opacity:0.5 }}/>
            </button>
          ))}
        </nav>
        <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
          {activeTab==="new"&&(
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="px-4 py-3.5 rounded-xl leading-relaxed" style={{ background:"#fff",color:mutedFg,border:`1px solid ${sidebarBorder}`,fontSize:"16px" }}>
                Inicia una nueva conversación. Se borrará el chat actual y podrás hacer una nueva consulta a MIJO.
              </div>
              <button onClick={()=>{onNewChat();onClose();setActiveTab(null);}} className="w-full py-4 rounded-xl font-bold transition-all active:scale-95"
                style={{ background:accent,color:"#fff",boxShadow:`0 4px 14px ${accent}44`,minHeight:"60px",fontSize:"17px" }}
              >＋  Iniciar nueva consulta</button>
            </div>
          )}
          {activeTab==="learn"&&(
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="px-4 py-3.5 rounded-xl leading-relaxed" style={{ background:"#fff",color:mutedFg,border:`1px solid ${sidebarBorder}`,fontSize:"16px" }}>
                Practica identificar noticias falsas e imágenes de IA. ¡Responde bien y desbloquea juegos!
              </div>
              <button onClick={()=>{onLearnOpen();onClose();}} className="w-full py-4 rounded-xl font-bold transition-all active:scale-95"
                style={{ background:accent,color:"#fff",boxShadow:`0 4px 14px ${accent}44`,minHeight:"60px",fontSize:"17px" }}
              >📚  Iniciar ejercicios</button>
            </div>
          )}
          {activeTab==="tutorial"&&(
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="px-4 py-3.5 rounded-xl leading-relaxed" style={{ background:"#fff",color:mutedFg,border:`1px solid ${sidebarBorder}`,fontSize:"16px" }}>
                Aprende a usar todas las funciones de MIJO paso a paso, con instrucciones claras y audio.
              </div>
              <button onClick={()=>{onTutorialOpen();onClose();setActiveTab(null);}} className="w-full py-4 rounded-xl font-bold transition-all active:scale-95"
                style={{ background:accent,color:"#fff",boxShadow:`0 4px 14px ${accent}44`,minHeight:"60px",fontSize:"17px" }}
              >▶  Abrir tutorial</button>
            </div>
          )}
          {activeTab==="settings"&&(
            <div className="px-3 pb-6">
              <div className="px-4 py-4 rounded-xl" style={{ background:"#fff",border:`1px solid ${sidebarBorder}` }}>
                <SettingsPanel settings={settings} onChange={onSettingsChange}/>
              </div>
            </div>
          )}

          {/* Ad banner */}
          <div className="mx-3 my-4 rounded-2xl overflow-hidden" style={{ border:"1.5px solid #d4c4a8" }}>
            <div className="flex items-center justify-between px-3 py-1.5" style={{ background:"#f0ebe2",borderBottom:"1px solid #d4c4a8" }}>
              <span className="font-bold uppercase tracking-wider" style={{ color:"#9a8a7a",fontSize:"10px" }}>Publicidad</span>
              <Tv size={12} color="#9a8a7a"/>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 py-5" style={{ background:"linear-gradient(135deg,#fff9ee,#fde4b8)",minHeight:"80px" }}>
              <span style={{ fontSize:"28px" }}>🛡️</span>
              <p className="font-bold text-center leading-tight" style={{ color:"#5c3d10",fontSize:"13px" }}>Protege a tu familia<br/>de las noticias falsas</p>
              <div className="px-3 py-1 rounded-full font-bold" style={{ background:"#E98A15",color:"#fff",fontSize:"11px" }}>Más información</div>
            </div>
          </div>
          <div className="h-4" />
        </div>
      </aside>
    </>
  );
}

// ─── Conversations ───────────────────────────────────────────────────────────

const PRESET_CONVERSATIONS: Array<{user:string;assistant:string}> = [
  { user:"Mijo, escuché en las noticias que rescataron con vida a 41 trabajadores que estuvieron atrapados durante 17 días en un túnel en la India. ¿Eso sí es cierto?",
    assistant:`¡Es VERDADERO! 41 trabajadores fueron rescatados con vida tras 17 días atrapados en un túnel en Uttarakhand, India.

✔ El rescate fue confirmado por medios internacionales.
✔ Todos salieron sanos y salvos.

📚 Fuente:
BBC
CNN en Español` },
  { user:"Mijo, me llegó un mensaje por WhatsApp que dice que las vacunas contra el COVID-19 tienen un microchip para rastrear a las personas. ¿Eso es cierto?",
    assistant:`¡Es FALSO! Las vacunas contra el COVID-19 no contienen microchips ni dispositivos de rastreo.

✔ Fueron evaluadas y aprobadas por autoridades sanitarias.
✖ Ningún componente de rastreo ha sido encontrado.

📚 Fuente:
OMS
Ministerio de Salud` },
  { user:"Mijo, escuché que los adultos mayores deberían vacunarse todos los años contra la gripe porque así disminuye el riesgo de enfermarse gravemente. ¿Eso sí es cierto?",
    assistant:`¡Es VERDADERO! Los adultos mayores deben vacunarse contra la gripe cada año para reducir el riesgo de complicaciones graves.

✔ El sistema inmune se debilita con la edad.
✔ Reduce el riesgo de hospitalizaciones.

📚 Fuente:
OPS
Ministerio de Salud` },
  { user:"Mijo, me llegó un mensaje que dice que en Perú ganó la izquierda en las últimas elecciones presidenciales. ¿Eso es cierto?",
    assistant:`¡Es FALSO! Este mensaje circula sin respaldo en resultados electorales oficiales.

✖ No hay datos que confirmen esta afirmación.
✖ Suele difundirse antes de que haya resultados oficiales.

📚 Fuente:
ONPE (Oficina Nacional de Procesos Electorales)` },
];

const INITIAL_MESSAGES: Message[] = [
  { id:"u1",role:"user",content:"Mijo, vi en Facebook que si me tomo un vaso de agua tibia con limón en ayunas todas las mañanas se me limpia la sangre, me baja la presión y me cura la diabetes. ¿Eso es cierto?",timestamp:new Date() },
  { id:"a1",role:"assistant",content:RESP_FALSO,timestamp:new Date() },
];

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,setScreen]=useState<AppScreen>("chat");
  const [settings,setSettings]=useState<AppSettings>({theme:"light",brightness:100,voice:"Presentador",fontSize:"A+"});
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [learningOpen,setLearningOpen]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [messages,setMessages]=useState<Message[]>([]);
  const [typing,setTyping]=useState(false);
  const [presetIndex,setPresetIndex]=useState(0);
  const [queryCount,setQueryCount]=useState(0);
  const [showPaywall,setShowPaywall]=useState(false);
  const bottomRef=useRef<HTMLDivElement>(null);
  const tourShownRef=useRef(false);

  const dark=false; const accent="#E98A15"; const hasMessages=messages.length>0;

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,typing]);

  const updateSettings=(s:Partial<AppSettings>)=>setSettings(prev=>({...prev,...s}));

  const checkAndSend=(fn:()=>void)=>{
    if(queryCount>=FREE_QUERIES){setShowPaywall(true);return;}
    setQueryCount(q=>q+1);
    fn();
  };

  // Envía un mensaje de texto (o imagen/link) real al backend de MIJO (Anthropic API)
  const sendMessage=(content:string,imageFile?:File)=>{
    checkAndSend(async ()=>{
      const imageUrl=imageFile?URL.createObjectURL(imageFile):undefined;
      const userMsg:Message={id:Date.now().toString(),role:"user",content,imageUrl,timestamp:new Date()};
      setMessages(prev=>[...prev,userMsg]);
      setTyping(true);
      const response = await askMijo(content, imageFile);
      setTyping(false);
      setMessages(prev=>[...prev,{id:(Date.now()+1).toString(),role:"assistant",content:response,timestamp:new Date()}]);
    });
  };

  // Envía un mensaje de voz real: usa la transcripción capturada por el micrófono
  const sendVoiceMessage=(transcript?:string)=>{
    checkAndSend(async ()=>{
      const text = (transcript ?? "").trim();
      if(!text){
        setMessages(prev=>[...prev,{id:`va${Date.now()}`,role:"assistant",content:"No logré escucharte bien. ¿Puedes intentarlo de nuevo?",timestamp:new Date()}]);
        return;
      }
      const voiceMsg: Message={id:`vm${Date.now()}`,role:"user",content:text,timestamp:new Date()};
      setMessages(prev=>[...prev,voiceMsg]);
      setTyping(true);
      const response = await askMijo(text);
      setTyping(false);
      setMessages(prev=>[...prev,{id:`va${Date.now()}`,role:"assistant",content:response,timestamp:new Date()}]);
      speak(response, settings.voice);
    });
  };

  const handleListeningTap=()=>{
    setScreen("chat");
    setMessages([]);
    if (!tourShownRef.current) {
      tourShownRef.current = true;
      setTimeout(() => setShowTutorial(true), 800);
    }
  };

  const handleWatchAd=()=>{
    setQueryCount(0);
    setShowPaywall(false);
  };

  const headerBg="rgba(250,247,242,0.97)"; const headerBorder="rgba(0,0,0,0.09)"; const footerBg="rgba(250,247,242,0.98)"; const noteColor="rgba(90,64,48,0.65)";

  if(screen==="social") return (
    <div className="size-full relative" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <style>{globalCSS}</style>
      <SocialScreen onTap={()=>setScreen("listening")}/>
    </div>
  );

  if(screen==="listening") return (
    <div className="size-full relative" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <style>{globalCSS}</style>
      <SocialScreen onTap={()=>{}}/>
      <MijoOrb onTap={handleListeningTap}/>
    </div>
  );

  return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"#FAF7F2",fontSize:FONT_SIZE_MAP[settings.fontSize],filter:`brightness(${settings.brightness/100})`,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <style>{globalCSS}</style>
      {showPaywall&&<PaywallModal onWatchAd={handleWatchAd} onClose={()=>setShowPaywall(false)}/>}
      {learningOpen&&<LearningScreen dark={dark} onClose={()=>setLearningOpen(false)}/>}
      {showTutorial&&<SpotlightTour onClose={()=>setShowTutorial(false)}/>}
      <Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} settings={settings} onSettingsChange={updateSettings}
        onLearnOpen={()=>setLearningOpen(true)}
        onNewChat={()=>{setMessages([]);setPresetIndex(0);setTyping(false);setQueryCount(0);}}
        onTutorialOpen={()=>setShowTutorial(true)}
      />

      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ background:headerBg,backdropFilter:"blur(12px)",borderBottom:`1px solid ${headerBorder}` }}
      >
        <button id="tour-menu-btn" onClick={()=>setSidebarOpen(true)} className="w-14 h-14 rounded-xl flex items-center justify-center transition-colors" style={{ color:"#5c4f3d" }} aria-label="Abrir menú">
          <Menu size={28}/>
        </button>
        <LogoImg dark={dark} className="h-11 w-auto"/>
        <div className="flex items-center gap-1 w-14 justify-end">
          <span id="tour-query-counter" className="font-bold text-xs px-2 py-1 rounded-lg" style={{ background:queryCount>=FREE_QUERIES?"#fde8e8":"#fff3dc",color:queryCount>=FREE_QUERIES?"#b84340":"#7a4a00",border:`1px solid ${queryCount>=FREE_QUERIES?"#f5a0a0":"#e6c87a"}` }}>
            {FREE_QUERIES - Math.min(queryCount,FREE_QUERIES)}/{FREE_QUERIES}
          </span>
        </div>
      </header>

      {!hasMessages?(
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto chat-scroll flex flex-col items-center justify-center gap-5 px-8 py-10 text-center">
            <LogoImg dark={dark} className="w-36 h-36 drop-shadow-lg flex-shrink-0"/>
            <p className="font-semibold leading-snug max-w-sm flex-shrink-0" style={{ color:"#2a1f10",fontSize:"22px" }}>
              ¡Hola! Soy MIJO, <span style={{ color:accent }}>¿qué deseas verificar hoy?</span>
            </p>
            <div className="flex-shrink-0"><BigMicButton accent={accent} dark={dark} onTranscript={sendVoiceMessage}/></div>
          </div>
          <div className="w-full flex-shrink-0 px-4 pt-3 pb-3" style={{ background:footerBg,backdropFilter:"blur(12px)",borderTop:`1px solid ${headerBorder}` }}>
            <div className="max-w-2xl mx-auto">
              <InputBar onSend={sendMessage} dark={dark} accent={accent}/>
              <p className="text-center font-medium mt-2" style={{ color:noteColor,fontFamily:"'DM Mono',monospace",fontSize:"13px" }}>MIJO puede cometer errores — verifica la información importante.</p>
            </div>
          </div>
        </div>
      ):(
        <>
          <main className="flex-1 overflow-y-auto chat-scroll px-4 py-5">
            <div className="max-w-2xl mx-auto">
              {messages.map(msg=>msg.role==="user"?<UserBubble key={msg.id} msg={msg}/>:<AssistantBubble key={msg.id} msg={msg} dark={dark} voice={settings.voice}/>)}
              {typing&&<TypingIndicator dark={dark}/>}
              <div ref={bottomRef}/>
            </div>
          </main>
          <footer className="flex-shrink-0 px-4 pt-3 pb-3" style={{ background:footerBg,backdropFilter:"blur(12px)",borderTop:`1px solid ${headerBorder}` }}>
            <div className="max-w-2xl mx-auto">
              <InputBar onSend={sendMessage} dark={dark} accent={accent} onMicPress={sendVoiceMessage}/>
              <p className="text-center font-medium mt-2" style={{ color:noteColor,fontFamily:"'DM Mono',monospace",fontSize:"13px" }}>MIJO puede cometer errores — verifica la información importante.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
