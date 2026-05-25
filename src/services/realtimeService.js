import { Server } from "socket.io";
import { corsOptions } from "../config/cors.js";

let io = null;

export const initRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: corsOptions(),
    path: "/socket.io"
  });

  io.on("connection", (socket) => {
    console.log("📡 Realtime conectado", { socketId: socket.id });

    socket.on("registro-datos:join", () => {
      socket.join("registro-datos");
      socket.emit("registro-datos:ready", { ok: true, actualizadoEn: new Date() });
    });

    socket.on("dashboard-alertas:join", () => {
      socket.join("dashboard-alertas");
      socket.emit("dashboard-alertas:ready", { ok: true, actualizadoEn: new Date() });
      console.log("✅ SOCKET ALERTAS OK", { socketId: socket.id });
    });

    socket.on("disconnect", (reason) => {
      console.log("📡 Realtime desconectado", { socketId: socket.id, reason });
    });
  });

  console.log("📡 Socket.IO realtime habilitado");
  return io;
};

export const emitRegistroDatosUpdate = (payload) => {
  if (!io) {
    console.log("📡 Realtime omitido: Socket.IO aun no inicializado");
    return;
  }

  io.to("registro-datos").emit("registro-datos:updated", {
    ...payload,
    actualizadoEn: new Date()
  });
};

export const emitDashboardAlertasUpdate = (payload = {}) => {
  if (!io) {
    console.log("📡 Realtime alertas omitido: Socket.IO aun no inicializado");
    return;
  }

  io.to("dashboard-alertas").emit("dashboard-alertas:updated", {
    ...payload,
    actualizadoEn: new Date()
  });
};
