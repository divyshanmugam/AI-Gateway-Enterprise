// src/services/vectorService.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { pipeline } from '@huggingface/transformers';

// Fallback to service name if running in docker network grid, otherwise local host for standalone terminal debugging
const qdrantUrl = process.env.NODE_ENV === 'production' 
  ? 'http://vector-db:6333' 
  : 'http://localhost:6333';

// Connect to your active Docker container instance running Qdrant
const qdrant = new QdrantClient({ url: qdrantUrl });
const COLLECTION_NAME = 'enterprise_knowledge';
let embeddingPipeline: any = null;

export const CACHE_COLLECTION_NAME = 'gateway_semantic_cache';

export async function initVectorCollection() {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (exists) {
      // Fetch active cluster details to crosscheck structural configurations
      const info = await qdrant.getCollection(COLLECTION_NAME);
      const activeSize = (info.config.params.vectors as any)?.size;

      // If the dimensions do not match our new 384 model, force drop it safely
      if (activeSize !== 384) {
        console.log(`[Vector DB] Dimension mismatch detected (Expected 384, found ${activeSize}). Recreating collection...`);
        await qdrant.deleteCollection(COLLECTION_NAME);
        await createNewCollection();
      } else {
        console.log(`[Vector DB] Collection "${COLLECTION_NAME}" is up to date with 384 dimensions.`);
      }
    } else {
      await createNewCollection();
    }

    // 2. New Semantic Cache Schema Checks
    const cacheExists = collections.collections.some(c => c.name === CACHE_COLLECTION_NAME);
    if (!cacheExists) {
      await qdrant.createCollection(CACHE_COLLECTION_NAME, {
        vectors: { size: 384, distance: 'Cosine' }
      });
      console.log(`[Cache DB] Initialized Semantic Cache Vector Layout: ${CACHE_COLLECTION_NAME}`);
    } else {
      console.log(`[Cache DB] Semantic Cache collection active.`);
    }
  } catch (error) {
    console.error('[Vector DB Init Failed]: Check your Docker setup.', error);
  }
}

// Internal wrapper to isolate generation logic paths cleanly
async function createNewCollection() {
  await qdrant.createCollection(COLLECTION_NAME, {
    vectors: {
      size: 384, // Explicitly set to match the local Xenova/BGE embedding dimension footprint
      distance: 'Cosine'
    }
  });
  console.log(`[Vector DB] Clean BGE Collection "${COLLECTION_NAME}" created successfully.`);
  await seedKnowledgeBase();
}

// 2. Read, Chunk, and Index internal documents into the Vector Container
async function seedKnowledgeBase() {
  const internalDocuments = [
    "Enterprise policy HR-201: Health Savings Accounts (HSA) employer match allocation limit is capped at $1,500 annually per employee workspace.",
    "Corporate technical framework protocol: Remote engineering deployments require dual-factor authorization tokens via VPN routing blocks.",
    "Company administrative protocol: Travel expenditures under $500 do not require manual pre-approval allocations from project directors."
  ];

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 150,
    chunkOverlap: 20
  });

  const points: any[] = [];
  let idCounter = 1;

  for (const doc of internalDocuments) {
    const chunks = await textSplitter.splitText(doc);
    console.log(`[Vector DB Seed] Document split into ${chunks} for indexing.`);
    
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      points.push({
        id: idCounter++,
        vector: embedding,
        payload: { text: chunk }
      });
    }
    console.log(`${points} chunks prepared for Qdrant upsert.`);
  }

  await qdrant.upsert(COLLECTION_NAME, { wait: true, points });
  console.log(`[Vector DB Seeded] Indexed ${points.length} chunks into Qdrant storage context.`);
}

// 1. Initialize a real local semantic embedding extractor model
async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    // Load a lightweight, highly accurate 384-dimension HuggingFace model engine
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
  }
  const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// 3. Query Qdrant for Semantic Similarity Matches
export async function searchVectorContext(userPrompt: string): Promise<string> {
  try {
    const queryVector = await getEmbedding(userPrompt);
    
    const results = await qdrant.query(COLLECTION_NAME, {
      query: queryVector,
      limit: 2, // Grab the top 2 closest context documents
      with_payload: true
    });

    // Map matched payload text together into a single contextual prompt string block
    return results.points
      .map(hit => hit.payload?.text as string)
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    console.error('[Vector Search Error]: Skipping retrieval.', err);
    return '';
  }
}

/**
 * Searches the semantic cache collection for a visually similar past query.
 * Returns the cached text string if the similarity score surpasses the threshold.
 */
export async function checkSemanticCache(userPrompt: string): Promise<string | null> {
  try {
    const queryVector = await getEmbedding(userPrompt);
    
    const results = await qdrant.query(CACHE_COLLECTION_NAME, {
      query: queryVector,
      limit: 1,
      with_payload: true
    });

    if (results.points.length > 0) {
      const topHit = results.points[0];
      // Establish a strict match threshold (88% identical semantic intent)
      if (topHit?.score && topHit.score > 0.88) {
        console.log(`[Semantic Cache HIT] Score: ${topHit.score.toFixed(4)}. intercepting request routing.`);
        return topHit.payload?.cached_response as string;
      }
    }
    console.log(`[Semantic Cache MISS] No close query footprint matches detected inside vector space.`);
    return null;
  } catch (err) {
    console.error('[Cache Lookup Error]: Proceeding with standard generation execution path.', err);
    return null;
  }
}

/**
 * Saves a prompt and its complete generated response stream as a new index vector cache entry.
 */
export async function saveToSemanticCache(userPrompt: string, completedResponse: string): Promise<void> {
  try {
    const queryVector = await getEmbedding(userPrompt);
    const uniqueId = Math.floor(Math.random() * 10000000); // Simple integer id generator

    await qdrant.upsert(CACHE_COLLECTION_NAME, {
      wait: true,
      points: [{
        id: uniqueId,
        vector: queryVector,
        payload: {
          original_prompt: userPrompt,
          cached_response: completedResponse,
          timestamp: new Date().toISOString()
        }
      }]
    });
    console.log(`[Semantic Cache Indexed] Saved prompt transaction to Qdrant storage array.`);
  } catch (err) {
    console.error('[Cache Save Error]: Failed to save point.', err);
  }
}
