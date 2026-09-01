export async function resolve(specifier, context, next) {
  if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch {}
  }
  return next(specifier, context);
}
