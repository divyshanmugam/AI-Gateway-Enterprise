export interface Telemetrics {
    totalTokensGenerated: number;
    avgTokensPerSec: number;
    totalTime: number;
};

export type StreamPayload = 
    | {type: "chunk"; text: string}
    | {type: "telemetry"; latency: number}
    | {type: "done"; metrics: Telemetrics}
    | {type: "error"; message: string};
