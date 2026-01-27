import { Container, getRandom } from "@cloudflare/containers";

// Use only one instance since we don't really need more and makes following logs a lot easier
const INSTANCE_COUNT = 1;

export class DressmeAPI extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "5m";
  envVars = {
    AUTH0_ALGORITHMS: this.env.AUTH0_ALGORITHMS,
    AUTH0_API_AUDIENCE: this.env.AUTH0_API_AUDIENCE,
    AUTH0_DOMAIN: this.env.AUTH0_DOMAIN,
    AUTH0_ISSUER: this.env.AUTH0_ISSUER,
    DATABASE_URL: this.env.DATABASE_URL,
    REPLICATE_API_TOKEN: this.env.REPLICATE_API_TOKEN,
  };
}

export interface Env {
  DRESSME_API: DurableObjectNamespace<DressmeAPI>;
  AUTH0_ALGORITHMS: string;
  AUTH0_API_AUDIENCE: string;
  AUTH0_DOMAIN: string;
  AUTH0_ISSUER: string;
  DATABASE_URL: string;
  REPLICATE_API_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      // note: "getRandom" to be replaced with latency-aware routing in the near future
      const containerInstance = await getRandom(env.DRESSME_API, INSTANCE_COUNT);
      return await containerInstance.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
