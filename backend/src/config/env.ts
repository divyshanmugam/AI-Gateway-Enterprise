import {z} from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default("3000"),
    GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required to run the gateway"),
});

export const env = envSchema.parse(process.env);
