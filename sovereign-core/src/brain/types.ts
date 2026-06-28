export interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface RpcEvent {
  event: string;
  params: Record<string, unknown>;
}
