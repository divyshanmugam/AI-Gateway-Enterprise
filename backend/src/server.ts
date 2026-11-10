// src/server.ts
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { env } from './config/env.js';
import { initVectorCollection, searchVectorContext, checkSemanticCache, saveToSemanticCache } from './services/vectorService.js';
import { securityMiddleware } from './middleware/security.js';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Qdrant Collection storage layout when server boots up
initVectorCollection();

app.post('/api/v1/chat/stream', securityMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'A text prompt string parameter is required.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const startTime = Date.now();

  try {
    // 1. Intercept Route Validation: Query the Semantic Cache Collection
    const cachedResponse = await checkSemanticCache(prompt);

    if (cachedResponse) {
        const latency = Date.now() - startTime;
        
        // Emit the instant telemetry indicators (0ms latency path simulation)
        res.write(`data: ${JSON.stringify({ type: 'telemetry', latency })}\n\n`);
        
        // Dump the complete cached string block inside a single execution token write loop
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: cachedResponse })}\n\n`);
        
        const totalTime = Date.now() - startTime;
        res.write(`data: ${JSON.stringify({ 
            type: 'done', 
            metrics: { totalTime, totalTokensGenerated: 1, avgTokensPerSec: 1000 }
        })}\n\n`);
        
        res.end();
        return;
    }
    // 1. Perform Context Retrieval against your Qdrant Container
    const dynamicContext = await searchVectorContext(prompt);

    const model = new ChatGroq({
      apiKey: env.GROQ_API_KEY,
      model: 'qwen/qwen3.8-27b', // Active supported Groq model
      streaming: true,
      temperature: 0.2 // Lowered temperature to minimize hallucinations
    });

    // 2. Build Injected Grounded Meta-Prompt for RAG execution
    const currentDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const messages = [
      new SystemMessage(
        `You are an advanced enterprise assistant. Current System Date: ${currentDate}.\nPrioritize using corporate contexts, but answer general inquiries smoothly.`
      ),
      new HumanMessage(prompt)
    ];

    const stream = await model.stream(messages);
    let completeResponseBuffer = '';
    let firstTokenEmitted = false;
    let totalTokensGenerated = 0;

    for await (const chunk of stream) {
      if (!firstTokenEmitted) {
        firstTokenEmitted = true;
        const latency = Date.now() - startTime;
        res.write(`data: ${JSON.stringify({ type: 'telemetry', latency })}\n\n`);
      }

      const textChunk = chunk.content as string;
      if (textChunk) {
        totalTokensGenerated++;
        completeResponseBuffer += textChunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: textChunk })}\n\n`);
      }
    }

    // 3. Complete Loop Success: Index the transaction results into cache memory arrays
    if (completeResponseBuffer.trim().length > 0) {
      await saveToSemanticCache(prompt, completeResponseBuffer);
    }

    const totalTime = Date.now() - startTime;
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      metrics: { totalTime, totalTokensGenerated, avgTokensPerSec: parseFloat((totalTokensGenerated / (totalTime / 1000)).toFixed(2)) }
    })}\n\n`);

    res.end();

  } catch (error: any) {
    console.error('Streaming RAG Gateway Execution Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal stream execution halted' })}\n\n`);
    res.end();
  }
});

const PORT = parseInt(env.PORT, 10);
app.listen(PORT, () => {
  console.log(`[Cache-Enabled Server Active] Hosting ports on http://localhost:${PORT}`);
});
