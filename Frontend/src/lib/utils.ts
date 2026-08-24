import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Without this, tailwind-merge reads the custom text-*2 scale as text colours and drops real colour classes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["xs2", "sm2", "md2", "lg2", "xl2", "2xl2", "3xl2", "display-sm", "display-md", "display-lg", "display-xl"]
        }
      ]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
