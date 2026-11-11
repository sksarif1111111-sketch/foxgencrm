import { callFoxgenAction } from "./foxgen-actions.server";
import { catalogueAction, type CatalogueProduct } from "./foxgen-catalogue";
import { logger } from "./logger";

/** Await bounded batches: no detached work that can be lost when the worker stops. */
export async function pushFoxgenCatalogue(products: CatalogueProduct[]) {
  let pushed = 0;
  let failed = 0;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, products.length) }, async () => {
    while (cursor < products.length) {
      const product = products[cursor++];
      if (!product) continue;
      try {
        const result = await callFoxgenAction(catalogueAction(product));
        if (result.ok) pushed++;
        else {
          failed++;
          logger.warn("FoxGen catalogue push failed, local catalogue retained", { product_id: product.id, error: result.error });
        }
      } catch {
        failed++;
        logger.warn("FoxGen catalogue push failed, local catalogue retained", { product_id: product.id });
      }
    }
  }));
  return { pushed, failed };
}