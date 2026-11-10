// src/components/Dashboard.tsx
import React, { useState } from 'react';
import { useGatewayStream } from '../hooks/useGatewayStream';

export function Dashboard() {
  const [inputPrompt, setInputPrompt] = useState('');
  const { streamBuffer, ttft, metrics, isStreaming, errorMsg, executePromptStream } = useGatewayStream();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isStreaming) return;
    executePromptStream(inputPrompt);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 selection:bg-emerald-500 selection:text-slate-950">
      <header className="mb-10 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider uppercase text-emerald-400">Enterprise AI Gateway Admin</h1>
        </div>
        <p className="text-slate-400 text-sm mt-1">Real-Time Core Stream Telemetry & Model Observability Grid</p>
      </header>

      {errorMsg && (
        <div className="mb-6 bg-red-950/50 border border-red-800 text-red-400 px-4 py-3 rounded-md text-sm">
          ⚠️ System Engine Halt: {errorMsg}
        </div>
      )}

      {/* Observability Scorecard Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Time to First Token (TTFT)</span>
          <div className="text-3xl font-mono font-bold mt-2 text-sky-400">
            {ttft !== null ? `${ttft}ms` : '--'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Generation Velocity</span>
          <div className="text-3xl font-mono font-bold mt-2 text-purple-400">
            {metrics?.avgTokensPerSec ? `${metrics.avgTokensPerSec} t/s` : '--'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Total Ingestion Duration</span>
          <div className="text-3xl font-mono font-bold mt-2 text-emerald-400">
            {metrics?.totalTime ? `${(metrics.totalTime / 1000).toFixed(2)}s` : '--'}
          </div>
        </div>
      </div>

      {/* Main Execution Split Panel Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg flex flex-col">
          <h2 className="text-md font-semibold mb-3 text-slate-200">Gateway Playground Request Layer</h2>
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
            <textarea
              className="w-full flex-1 min-h-[160px] bg-slate-950 border border-slate-800 rounded-md p-4 text-slate-300 font-sans focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600 leading-relaxed"
              placeholder="Enter internal infrastructure test prompt strings here..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
            />
            <button
              type="submit"
              disabled={isStreaming}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 font-semibold py-3 rounded-md transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              {isStreaming ? 'Streaming System Output Chunks...' : 'Dispatch Process Request'}
            </button>
          </form>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg flex flex-col">
          <h2 className="text-md font-semibold mb-3 text-slate-200">Live Orchestrator Streaming Output</h2>
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-md p-5 font-mono text-sm leading-relaxed overflow-y-auto max-h-[320px] min-h-[220px] whitespace-pre-wrap text-emerald-400 antialiased">
            {streamBuffer || <span className="text-slate-700 italic font-sans">Awaiting structural incoming text chunks...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
