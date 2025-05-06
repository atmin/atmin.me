import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const pano = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/data/pano",
  }),
  schema: z.object({
    title: z.string(),
  })
});

export const collections = { pano };
