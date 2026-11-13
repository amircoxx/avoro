declare module "supertest" {
  import type { Express } from "express";

  type SupertestResponse = {
    status: number;
    body: unknown;
  };

  type SupertestRequest = {
    get(path: string): Promise<SupertestResponse>;
    put(path: string): Promise<SupertestResponse>;
    delete(path: string): Promise<SupertestResponse>;
    post(path: string): {
      send(body: unknown): Promise<SupertestResponse>;
    };
  };

  export default function request(app: Express): SupertestRequest;
}
