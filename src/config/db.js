import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Atlas conectado correctamente", {
      host: mongoose.connection.host,
      db: mongoose.connection.name
    });
  } catch (error) {
    console.error("Error MongoDB:", error.message);
    process.exit(1);
  }
};
