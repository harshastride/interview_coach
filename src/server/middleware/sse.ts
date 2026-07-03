import express from "express";

export interface SSEConnection {
  userId: number;
  res: express.Response;
}

const connections = new Set<SSEConnection>();

export function addConnection(userId: number, res: express.Response) {
  const conn = { userId, res };
  connections.add(conn);
  return () => {
    connections.delete(conn);
  };
}

export function notifyUserStatus(userId: number, status: string) {
  for (const conn of connections) {
    if (conn.userId === userId) {
      try {
        conn.res.write(`data: ${JSON.stringify({ status })}\n\n`);
        if (typeof (conn.res as any).flush === "function") {
          (conn.res as any).flush();
        }
      } catch (err) {
        console.error("Error writing to SSE stream:", err);
      }
    }
  }
}
