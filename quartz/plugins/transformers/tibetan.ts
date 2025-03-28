import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root, Text, Element } from "hast"

export const Tibetan: QuartzTransformerPlugin = () => {
  return {
    name: "Tibetan",
    htmlPlugins() {
      return [
        () => {
          return (tree: Root) => {
            // Collect nodes to process first, then modify them after traversal
            const nodesToProcess: { node: Text, parent: Element, index: number }[] = []
            
            visit(tree, "text", (node: Text, index, parent) => {
              // Skip if parent is an anchor tag
              if (parent && (parent as Element).tagName === "a") {
                return
              }
              
              // Tibetan Unicode range: U+0F00 to U+0FFF
              const tibetanRegex = /[\u0F00-\u0FFF]+/g
              
              if (tibetanRegex.test(node.value)) {
                nodesToProcess.push({ 
                  node, 
                  parent: parent as Element, 
                  index: index as number 
                })
              }
            })
            
            // Process nodes in reverse order to maintain correct indices
            for (let i = nodesToProcess.length - 1; i >= 0; i--) {
              const { node, parent, index } = nodesToProcess[i]
              
              // Split the text to preserve non-Tibetan parts
              const parts: (Text | Element)[] = []
              let lastIndex = 0
              let match
              
              const tibetanRegex = /[\u0F00-\u0FFF]+/g
              while ((match = tibetanRegex.exec(node.value)) !== null) {
                // Add text before the match
                if (match.index > lastIndex) {
                  parts.push({
                    type: "text",
                    value: node.value.slice(lastIndex, match.index)
                  })
                }
                
                // Add wrapped Tibetan text
                parts.push({
                  type: "element",
                  tagName: "span",
                  properties: { className: ["uchen"] },
                  children: [{ type: "text", value: match[0] }]
                })
                
                lastIndex = tibetanRegex.lastIndex
              }
              
              // Add remaining text
              if (lastIndex < node.value.length) {
                parts.push({
                  type: "text",
                  value: node.value.slice(lastIndex)
                })
              }
              
              // Replace the text node with the new parts
              if (parent && parent.children) {
                parent.children.splice(index, 1, ...parts)
              }
            }
          }
        }
      ]
    }
  }
}
