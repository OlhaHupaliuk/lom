const { MongoClient } = require("mongodb");
require("dotenv").config({ debug: true });

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

const dbName = "parserBot";
const collectionName = "products";

async function connectDB() {
  try {
    if (!uri) {
      throw new Error("MONGODB_URI is not set in .env");
    }
    await client.connect();
    console.log("[DB] Connected to MongoDB");
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    console.log("[DB] Accessed collection:", collectionName);
    return collection;
  } catch (err) {
    console.error("[DB] MongoDB connection error:", err.message);
    throw err;
  }
}

module.exports = { connectDB };
