export const corsOptions = () => {
  const raw = process.env.CORS_ORIGINS || "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      // requests sin origin (apps móviles / Postman / server-to-server) -> permitir
      if (!origin) return callback(null, true);

      // si no configuraste whitelist, permite todo (útil en dev)
      if (allowed.length === 0) return callback(null, true);

      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-role", "x-user"],
    credentials: false
  };
};
