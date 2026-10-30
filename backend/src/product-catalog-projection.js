import crypto from "node:crypto";
import {
  isCurrentProductContract,
  isCurrentProductDependency,
  listEntitlementsForUser,
  listProducts,
} from "./product-catalog-repository.js";

export async function getPublishedProductCatalog(userId = null) {
  const products = (await listProducts({ includeUnpublished: false })).filter((product) =>
    product.dependencies?.length > 0 &&
    product.dependencies.every(isCurrentProductDependency) &&
    isCurrentProductContract(product));
  const catalogRevision = crypto.createHash("sha256").update(JSON.stringify(products.map((product) => ({
    id: product.id,
    version: product.version,
    status: product.status,
    contractHash: product.contractHash,
    dependencies: product.dependencies.map((dependency) => ({
      agentKey: dependency.agentKey,
      version: dependency.version,
      contractHash: dependency.contractHash,
    })),
  })))).digest("hex");
  const currentProductVersions = new Set(products.map((product) => product.productVersionId));
  const entitlements = userId
    ? (await listEntitlementsForUser(userId)).map((entitlement) => {
      if (entitlement.status !== "enabled" || currentProductVersions.has(entitlement.productVersionId)) return entitlement;
      return {
        ...entitlement,
        status: "unavailable",
        unavailableReason: entitlement.unavailableReason || "Product dependency contract is unavailable",
      };
    })
    : [];
  return { products, entitlements, catalogRevision, catalogStatus: "ready" };
}
