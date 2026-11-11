import { listAgents } from "../../agents/registry.js";
import { isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { listRegisteredAgentsWithCatalogue } from "./agent-catalog-repository.js";
import { getProduct, isCurrentProductContract, productDependencyBlockers } from "./product-catalog-repository.js";
import { getPublishedProductCatalog } from "./product-catalog-projection.js";
import { withUserAgentPresentation } from "./agent-user-presentation.js";

const sameScopes = (a = [], b = []) => a.length === b.length && a.every(scope => b.includes(scope));

// Read the same public projection as /api/agents without registry/catalog sync,
// entitlement creation, runtime execution or provider requests.
export function createAgentCatalogDiagnostics({
  listRegistered = listAgents,
  readRegisteredCatalogue = agents => listRegisteredAgentsWithCatalogue(agents, { sync: false }),
  readPublishedCatalog = getPublishedProductCatalog,
  readProduct = getProduct,
} = {}) {
  return async ({ release, products }) => {
    const [registered, catalog, associated] = await Promise.all([
      listRegistered(),
      readPublishedCatalog(),
      Promise.all(products.map(product => readProduct(product.id, { productVersionId: product.productVersionId }))),
    ]);
    const source = registered.find(agent => agent.key === release.agentKey);
    const projected = withUserAgentPresentation(await readRegisteredCatalogue(registered), catalog)
      .find(agent => agent.key === release.agentKey);
    const visible = projected?.published === true;
    const reasons = [];
    if (!source) reasons.push({ code: "SOURCE_NOT_REGISTERED", message: "当前服务源码中没有该 Agent。" });
    else {
      if (source.version !== release.version) reasons.push({ code: "SOURCE_VERSION_STALE", message: `当前源码为 ${source.version}，所选 release 为 ${release.version}。` });
      if (!sameScopes(source.permissions, release.declaredScopes)) reasons.push({ code: "SOURCE_SCOPES_STALE", message: "所选 release 权限与当前源码声明不一致，需从当前代码创建 release。" });
    }
    if (release.catalogStatus !== "published") reasons.push({ code: "RELEASE_NOT_PUBLISHED", message: "所选 Agent release 尚未发布。" });
    if (!isCompleteAgentIdentity(release.identity)) reasons.push({ code: "IDENTITY_INCOMPLETE", message: "所选 Agent release 发布身份不完整。" });
    if (projected?.identityError?.code === "AGENT_PRODUCT_IDENTITY_CONFLICT") reasons.push(projected.identityError);
    const currentVersions = new Set((catalog.products || []).map(product => product.productVersionId));
    const productDiagnostics = associated.map((product, index) => {
      const blockers = [];
      if (!product) blockers.push({ code: "PRODUCT_NOT_FOUND", message: "关联产品版本已不可读取，请刷新后重试。" });
      else {
        if (product.status !== "published") blockers.push({ code: "PRODUCT_NOT_PUBLISHED", message: "产品版本尚未发布。" });
        if (!isCurrentProductContract(product)) blockers.push({ code: "PRODUCT_CONTRACT_STALE", message: "产品版本合同不匹配。" });
        if (!product.dependencies?.length) blockers.push({ code: "PRODUCT_DEPENDENCIES_REQUIRED", message: "产品版本没有 Agent 依赖。" });
        for (const dependency of product.dependencies || []) {
          blockers.push(...productDependencyBlockers(dependency).map(blocker => ({ ...blocker, agentKey: dependency.agentKey })));
        }
        if (!product.dependencies?.some(dependency => dependency.agentReleaseId === release.id)) blockers.push({ code: "PRODUCT_RELEASE_MISMATCH", message: "该产品版本未绑定所选 release。" });
        if (!blockers.length && !currentVersions.has(product.productVersionId)) blockers.push({ code: "PRODUCT_VERSION_NOT_IN_CATALOG", message: "该版本未被当前公开目录选用，请核对同产品的最新已发布版本。" });
      }
      return {
        id: products[index].id, productVersionId: products[index].productVersionId,
        productKey: product?.productKey || products[index].productKey,
        version: product?.version || products[index].version,
        status: product?.status || products[index].status,
        reasons: blockers,
      };
    });
    const usesProductCatalog = release.agentKey !== "miaoxun-butler";
    const selectedReleaseVisible = visible && reasons.length === 0 && (usesProductCatalog
      ? productDiagnostics.some(product => product.reasons.length === 0)
      : projected.contractHash === release.contractHash);
    if (!selectedReleaseVisible && usesProductCatalog && !productDiagnostics.some(product => product.reasons.length === 0)) reasons.push({ code: "AGENT_PRODUCT_UNAVAILABLE", message: "尚无当前可用的已发布产品绑定此 release；单独发布 release 不会进入 App 目录。" });
    if (!selectedReleaseVisible && !usesProductCatalog) reasons.push({ code: "CATALOG_RELEASE_UNAVAILABLE", message: "内置管家的目录身份尚未发布或未对应所选 release。" });
    return {
      checkedAt: new Date().toISOString(), visible, selectedReleaseVisible,
      sourceVersion: source?.version || null, reasons, products: productDiagnostics,
    };
  };
}

export const readAgentCatalogDiagnostics = createAgentCatalogDiagnostics();
