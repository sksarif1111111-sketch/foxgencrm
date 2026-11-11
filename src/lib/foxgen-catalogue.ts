export interface CatalogueProduct {
  id: string;
  name: string;
  description: string | null;
  selling_price: number;
  stock_count: number | null;
  image_url?: string | null;
}

export function catalogueAction(product: CatalogueProduct) {
  return {
    action: "upsert_product" as const,
    reseller_product_id: product.id,
    name: product.name,
    short_description: product.description,
    price_usdt: product.selling_price,
    stock_quantity: product.stock_count,
    image_url: product.image_url ?? null,
  };
}