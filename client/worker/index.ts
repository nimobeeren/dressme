import { Container, getRandom, getContainer } from "@cloudflare/containers";

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
      // LEFT HERE
      // TODO: it seems like the request is not being sent to the right port
      // it works when changing the port manually to 8000 here, but not when leaving it as 5173
      // the static-frontend-container-backend template works just fine
      // next step maybe adjust this template to use the vite plugin and see if it breaks?
      const newReq = new Request(`http://localhost:8000${url.pathname}`, {
        method: request.method,
        headers: request.headers,
        body: request.clone().body,
      });
      return await containerInstance.fetch(newReq);
      // return await containerInstance.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
