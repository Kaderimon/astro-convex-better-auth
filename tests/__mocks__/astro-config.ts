export const envField = {
  string: (opts: object) => ({ type: "string", ...opts }),
  number: (opts: object) => ({ type: "number", ...opts }),
  boolean: (opts: object) => ({ type: "boolean", ...opts }),
}
