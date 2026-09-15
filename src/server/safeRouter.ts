import express from "express";
// Express 4 does not forward rejected async handlers to error middleware.
export function safeRouter() {
  const router = express.Router();
  for (const method of [
    "get",
    "post",
    "patch",
    "put",
    "delete",
    "all",
  ] as const) {
    const original = router[method].bind(router);
    (router as any)[method] = (path: any, ...handlers: any[]) =>
      original(
        path,
        ...handlers.map((fn) => (req: any, res: any, next: any) => {
          try {
            Promise.resolve(fn(req, res, next)).catch(next);
          } catch (e) {
            next(e);
          }
        }),
      );
  }
  return router;
}
