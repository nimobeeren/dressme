import { Container, getRandom } from "@cloudflare/containers";

// Use only one instance since we don't really need more and makes following logs a lot easier
const INSTANCE_COUNT = 1;

export class DressmeAPI extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "5m";
  envVars = {
    MODE: this.env.MODE,
    AUTH0_ALGORITHMS: this.env.AUTH0_ALGORITHMS,
    AUTH0_API_AUDIENCE: this.env.AUTH0_API_AUDIENCE,
    AUTH0_DOMAIN: this.env.AUTH0_DOMAIN,
    AUTH0_ISSUER: this.env.AUTH0_ISSUER,
    DATABASE_URL: this.env.DATABASE_URL,
    REPLICATE_API_TOKEN: this.env.REPLICATE_API_TOKEN,
    R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    R2_S3_URL: this.env.R2_S3_URL,
  };
}

export interface Env {
  DRESSME_API: DurableObjectNamespace<DressmeAPI>;
  MODE: string;
  AUTH0_ALGORITHMS: string;
  AUTH0_API_AUDIENCE: string;
  AUTH0_DOMAIN: string;
  AUTH0_ISSUER: string;
  DATABASE_URL: string;
  REPLICATE_API_TOKEN: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_S3_URL: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      const cfRay = request.headers.get("cf-ray");
      try {
        // note: "getRandom" to be replaced with latency-aware routing in the near future
        const containerInstance = await getRandom(env.DRESSME_API, INSTANCE_COUNT);
        return await containerInstance.fetch(request);
      } catch (error) {
        console.error("Container fetch error:", { cfRay, error });
        return new Response("Service temporarily unavailable", {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  },
};
