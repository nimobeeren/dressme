import { Container, getRandom } from "@cloudflare/containers";

const INSTANCE_COUNT = 3;

export class DressmeAPI extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "5m";
}

export interface Env {
  DRESSME_API: DurableObjectNamespace<DressmeAPI>;
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
