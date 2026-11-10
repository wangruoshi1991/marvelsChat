import { createComicRenderRepository } from "./comic-render-repository.js";
import { buildAgentReadiness } from "./agent-readiness-service.js";
import { HttpError } from "./http-error.js";

export function createComicRenderService({ repository=createComicRenderRepository(), assertReady }={}) {
  const guard=assertReady??(async()=>{
    const status=(await buildAgentReadiness())["comic-diary"];
    if(!status?.configured)throw new HttpError(503,"漫画图片生成服务尚未就绪。",{code:"COMIC_RENDER_NOT_READY"});
  });
  return {...repository,createComicRenderTask:args=>repository.createComicRenderTask({...args,assertReady:guard})};
}
export const comicRenderService=createComicRenderService();
