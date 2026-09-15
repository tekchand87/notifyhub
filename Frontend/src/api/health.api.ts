import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export type KafkaStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface KafkaHealthResponse {
  success: boolean;
  kafka: {
    status: KafkaStatus;
    broker?: string;
    latencyMs?: number;
    cached?: boolean;
    error?: string;
  };
}

export const healthApi = {
  getKafkaHealth: async (): Promise<KafkaHealthResponse> => {
    try {
      const res = await axios.get<KafkaHealthResponse>(`${BASE_URL}/health/kafka`, {
        timeout: 8_000,
      });
      return res.data;
    } catch {
      return {
        success: false,
        kafka: { status: 'unknown' },
      };
    }
  },
};
