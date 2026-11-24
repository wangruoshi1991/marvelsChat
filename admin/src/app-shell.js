import { createRoot } from "react-dom/client";
import { unstableSetRender } from "antd";

// Ant Design 5 static dialogs and wave effects need a React 19 render adapter.
const transientRoots = new WeakMap();

export function mountAdminApp(container, application) {
  if (!container) throw new Error("Missing admin root container");
  unstableSetRender((node, target) => {
    let root = transientRoots.get(target);
    if (!root) {
      root = createRoot(target);
      transientRoots.set(target, root);
    }
    root.render(node);
    return async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (transientRoots.get(target) === root) {
        root.unmount();
        transientRoots.delete(target);
      }
    };
  });
  createRoot(container).render(application);
}
