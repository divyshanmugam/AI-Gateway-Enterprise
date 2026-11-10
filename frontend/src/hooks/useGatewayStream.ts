// src/hooks/useGatewayStream.ts
import { useState } from 'react';
import type { StreamPayload, Telemetrics } from '../types/gateway';

export function useGatewayStream() {
  const [streamBuffer, setStreamBuffer] = useState<string>('');
  const [ttft, setTtft] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Telemetrics | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const executePromptStream = async (prompt: string) => {
    setStreamBuffer('');
    setTtft(null);
    setMetrics(null);
    setErrorMsg(null);
    setIsStreaming(true);

    try {
      const response = await fetch('http://localhost:3000/api/v1/chat/stream', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-API-KEY': 'sk_dev_gateway_test_token_123'
         },
        body: JSON.stringify({ prompt })
      });

      if (!response.body) throw new Error('Readable stream connection failed.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let internalChunks = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        internalChunks += decoder.decode(value, { stream: true });
        const dataLines = internalChunks.split('\n\n');
        
        // Retain any partial trailing payload fragment safely
        internalChunks = dataLines.pop() || '';

        for (const line of dataLines) {
          if (!line.startsWith('data: ')) continue;
          const jsonText = line.replace('data: ', '').trim();
          
          try {
            const payload: StreamPayload = JSON.parse(jsonText);

            if (payload.type === 'telemetry') {
              setTtft(payload.latency);
            } else if (payload.type === 'chunk') {
              setStreamBuffer(prev => prev + payload.text);
            } else if (payload.type === 'done') {
              setMetrics(payload.metrics);
            } else if (payload.type === 'error') {
              setErrorMsg(payload.message);
            }
          } catch (e) {
            // Skips malformed delimiter parses quietly
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network connectivity to gateway lost.');
    } finally {
      setIsStreaming(false);
    }
  };

  return { streamBuffer, ttft, metrics, isStreaming, errorMsg, executePromptStream };
}
