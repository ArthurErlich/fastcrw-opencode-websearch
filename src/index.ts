import { Plugin } from "@opencode/plugin"
import { resolveConfig } from "./config.ts"
import { search } from "./search.ts"

export default Plugin.define({
  id: "fastcrw.websearch",
  async setup(ctx) {
    // Throws on bad options so a misconfigured plugin fails loudly instead of silently searching elsewhere.
    const config = resolveConfig(ctx.options, process.env)
    await ctx.websearch.transform((editor) => {
      editor.add({
        id: "fastcrw",
        name: "fastCRW",
        execute: ({ query }, { signal }) => search(config, query, signal),
      })
      editor.default.set("fastcrw")
    })
  },
})
