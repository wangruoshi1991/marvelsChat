import crypto from "node:crypto";
import {
  isCurrentProductContract,
  isCurrentProductDependency,
  listEntitlementsForUser,
  listProducts,
  getProduct,
} from "./product-catalog-repository.js";

export async function getPublishedProductCatalog(userId = null) {
  const products = (await listProducts({ includeUnpublished: false })).filter((product) =>
    product.dependencies?.length > 0 &&
    product.dependencies.every(isCurrentProductDependency) &&
    isCurrentProductContract(product));
  const entitlements = userId ? await listEntitlementsForUser(userId) : [];
  // A publication never upgrades a user's consent. Existing users continue to
  // receive the exact published version they enabled while its runtime remains
  // current. New users see the latest published version.
  for (const entitlement of entitlements) {
    if (entitlement.status !== "enabled") continue;
    const product = await getProduct(entitlement.productId, { productVersionId: entitlement.productVersionId });
    if (!product || product.status !== "published" || !isCurrentProductContract(product) || !product.dependencies?.every(isCurrentProductDependency)) continue;
    const index = products.findIndex(item => item.id === product.id);
    if (index >= 0) products[index] = product;
    else products.push(product);
  }
  products.sort((left, right) => left.productKey.localeCompare(right.productKey));
  const catalogRevision = crypto.createHash("sha256").update(JSON.stringify({
    products: products.map((product) => ({
      id: product.id, productVersionId: product.productVersionId, version: product.version,
      status: product.status, contractHash: product.contractHash,
      dependencies: product.dependencies.map(dependency => ({ agentKey: dependency.agentKey, agentReleaseId: dependency.agentReleaseId, version: dependency.version, contractHash: dependency.contractHash })),
    })),
    entitlements: entitlements.map(entitlement => ({ id: entitlement.id, productVersionId: entitlement.productVersionId, status: entitlement.status, contractHash: entitlement.contractHash })),
  })).digest("hex");
  return { products, entitlements, catalogRevision, catalogStatus: "ready" };
}
