import { QuartzTransformerPlugin } from "../types"

export const Tibetan: QuartzTransformerPlugin = () => {
  return {
    name: "Tibetan",
    textTransform(_ctx, src) {
      // Tibetan Unicode range: U+0F00 to U+0FFF
      const tibetanRegex = /[\u0F00-\u0FFF]+/g
      
      return src.replace(tibetanRegex, (match) => {
        return `<span style="font-size: 1.8em; line-height: 1.4em;">${match}</span>`
      })
    }
  }
}
